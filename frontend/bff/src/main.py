import uuid
import logging
from contextlib import asynccontextmanager
from typing import Optional, Dict
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware

from src.schemas import (
    DigitizationJobResponse,
    DetectedSignatureModel,
    IngestScanInitResponse,
    BlockchainInfo,
)
from src.ocr_engine import OcrEngine
from src.storage import StorageManager
from src.backend_client import BackendClient

logger = logging.getLogger("ocr_bff")
logging.basicConfig(level=logging.INFO)

ocr_engine: Optional[OcrEngine] = None
storage_manager: Optional[StorageManager] = None
backend_client: Optional[BackendClient] = None

jobs_store: Dict[str, DigitizationJobResponse] = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    global ocr_engine, storage_manager, backend_client
    logger.info("Iniciando DyxerSignature OCR BFF Service...")
    ocr_engine = OcrEngine()
    storage_manager = StorageManager()
    backend_client = BackendClient()
    logger.info("DyxerSignature OCR BFF Service inicializado y listo.")
    yield
    logger.info("Cerrando DyxerSignature OCR BFF Service.")

app = FastAPI(
    title="DyxerSignature OCR BFF",
    description="Backend For Frontend de Ingesta, PaddleOCR y Extracción de Firmas",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
@app.get("/api/bff/ocr/health")
async def health():
    return {
        "status": "Healthy",
        "service": "DyxerSignature OCR BFF",
        "ready": ocr_engine is not None
    }

@app.post("/api/v1/contracts/{contract_id}/ingest/scan", response_model=IngestScanInitResponse)
@app.post("/api/bff/ocr/contracts/{contract_id}/scan", response_model=IngestScanInitResponse)
async def process_scan(
    contract_id: str,
    file: UploadFile = File(...),
    correctionReason: Optional[str] = Form(None)
):
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="Archivo escaneado requerido.")

    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="El archivo recibido está vacío.")

        job_id = str(uuid.uuid4())
        filename = file.filename

        # 1. Almacenar el archivo de escaneo
        storage_manager.save_scan(job_id, filename, content)

        # 2. Ejecutar inferencia PaddleOCR
        ocr_result = ocr_engine.process_file(content, filename)

        # 3. Guardar recortes de firmas manuscritas
        detected_signatures_list = []
        for sig in ocr_result["signatures"]:
            sig_id = sig["id"]
            storage_manager.save_crop(job_id, sig_id, sig["crop_bytes"])
            detected_signatures_list.append(
                DetectedSignatureModel(
                    id=sig_id,
                    pageNumber=sig["page_number"],
                    boundingBox=sig["box_str"],
                    confidence=sig["confidence"],
                    cropStorageKey=f"crops/{job_id}/{sig_id}.png"
                )
            )

        # 4. Notificar y registrar la versión firmada en el Backend .NET para anclaje Blockchain
        backend_resp = await backend_client.register_signed_version(
            contract_id=contract_id,
            filename=filename,
            file_bytes=content,
            correction_reason=correctionReason or "Digitalización OCR PP-OCRv4"
        )

        avg_conf = ocr_result["average_confidence"]
        requires_review = avg_conf < 0.85

        # 5. Guardar estado del job en memoria
        job_response = DigitizationJobResponse(
            digitizationJobId=job_id,
            status="RequiresReview" if requires_review else "Completed",
            confidenceScore=avg_conf,
            requiresReview=requires_review,
            extractedTextSummary=ocr_result["raw_text"],
            signaturesDetected=detected_signatures_list,
            generatedDocumentVersionId=backend_resp.get("id") if isinstance(backend_resp, dict) else None,
            documentHash=backend_resp.get("documentHash") if isinstance(backend_resp, dict) else None,
            versionStatus="Active",
            blockchain=BlockchainInfo(
                status="Pending",
                transactionHash=None,
                blockNumber=None
            )
        )
        jobs_store[job_id] = job_response

        return IngestScanInitResponse(
            contractId=contract_id,
            digitizationJobId=job_id,
            status="Completed",
            fileName=filename
        )

    except HTTPException:
        raise
    except Exception as ex:
        logger.error(f"Fallo en procesamiento de OCR en BFF: {ex}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error en BFF de OCR: {str(ex)}")

@app.get("/api/v1/contracts/{contract_id}/ingest/{job_id}", response_model=DigitizationJobResponse)
@app.get("/api/bff/ocr/contracts/{contract_id}/jobs/{job_id}", response_model=DigitizationJobResponse)
async def get_job_detail(contract_id: str, job_id: str):
    job = jobs_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Digitalization job not found.")
    return job

@app.get("/api/v1/contracts/{contract_id}/ingest/{job_id}/signatures/{signature_id}/file")
@app.get("/api/bff/ocr/contracts/{contract_id}/jobs/{job_id}/signatures/{signature_id}/file")
async def get_signature_crop(contract_id: str, job_id: str, signature_id: str):
    crop_path = storage_manager.get_crop_path(job_id, signature_id)
    if not crop_path or not crop_path.exists():
        raise HTTPException(status_code=404, detail="Signature crop file not found.")
    return FileResponse(path=str(crop_path), media_type="image/png")

@app.get("/api/v1/contracts/{contract_id}/ingest/{job_id}/file")
@app.get("/api/bff/ocr/contracts/{contract_id}/jobs/{job_id}/file")
async def get_scan_file(contract_id: str, job_id: str):
    scan_path = storage_manager.get_scan_path(job_id)
    if not scan_path or not scan_path.exists():
        raise HTTPException(status_code=404, detail="Scan file not found.")

    media_type = "application/pdf" if scan_path.suffix.lower() == ".pdf" else "image/jpeg"
    return FileResponse(path=str(scan_path), media_type=media_type)

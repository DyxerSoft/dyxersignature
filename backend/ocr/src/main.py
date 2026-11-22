import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from src.ocr_engine import OcrEngine
from src.schemas import OcrExtractionResponse

logger = logging.getLogger("ocr_service")

engine: OcrEngine = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine
    logger.info("Iniciando servicio de PaddleOCR...")
    engine = OcrEngine()
    logger.info("Servicio de PaddleOCR listo para recibir peticiones.")
    yield
    logger.info("Cerrando servicio de PaddleOCR.")

app = FastAPI(
    title="DyxerSignature OCR Service",
    description="Servicio Sidecar de Inferencia con PaddlePaddle / PaddleOCR",
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

@app.get("/api/v1/ocr/health")
async def health():
    return {
        "status": "Healthy",
        "engine": "PaddleOCR PP-OCRv4",
        "ready": engine is not None
    }

@app.post("/api/v1/ocr/extract", response_model=OcrExtractionResponse)
async def extract_text(file: UploadFile = File(...)):
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="Archivo requerido.")

    try:
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="El archivo está vacío.")

        result = engine.process_file(content, file.filename)
        return result
    except Exception as ex:
        logger.error(f"Error procesando OCR para {file.filename}: {ex}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Fallo en motor OCR: {str(ex)}")

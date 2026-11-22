import base64
import io
import uuid
import logging
from typing import List, Tuple
from PIL import Image
import numpy as np
import pypdfium2 as pdfium
from paddleocr import PaddleOCR

from src.schemas import (
    OcrExtractionResponse,
    OcrTextBlock,
    DetectedSignature,
    BoundingBox,
)

logger = logging.getLogger("ocr_engine")
logging.basicConfig(level=logging.INFO)

class OcrEngine:
    def __init__(self):
        logger.info("Inicializando motor PaddleOCR...")
        self.ocr = PaddleOCR(
            use_angle_cls=True,
            lang="es",
            show_log=False
        )
        logger.info("Motor PaddleOCR inicializado correctamente.")

    def process_file(self, file_bytes: bytes, filename: str) -> OcrExtractionResponse:
        images: List[Image.Image] = []
        is_pdf = filename.lower().endswith(".pdf") or file_bytes.startswith(b"%PDF")

        if is_pdf:
            pdf = pdfium.PdfDocument(file_bytes)
            for page in pdf:
                # Renderiza a 200 DPI para óptima resolución de OCR
                bitmap = page.render(scale=2.0)
                pil_image = bitmap.to_pil()
                images.append(pil_image)
        else:
            pil_image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
            images.append(pil_image)

        total_pages = len(images)
        all_blocks: List[OcrTextBlock] = []
        all_signatures: List[DetectedSignature] = []
        full_text_parts: List[str] = []
        confidences: List[float] = []

        signature_keywords = ["firma", "firmante", "apoderado", "cliente", "aceptado", "rúbrica", "autorizado"]

        for page_idx, img in enumerate(images, start=1):
            img_np = np.array(img)
            result = self.ocr.ocr(img_np, cls=True)

            page_blocks: List[OcrTextBlock] = []
            if result and len(result) > 0 and result[0] is not None:
                for line in result[0]:
                    coords, (text, conf) = line
                    conf_float = float(conf)
                    confidences.append(conf_float)
                    page_blocks.append(
                        OcrTextBlock(
                            text=text,
                            confidence=round(conf_float, 4),
                            box=[[int(pt[0]), int(pt[1])] for pt in coords]
                        )
                    )
                    full_text_parts.append(text)

                    # Detección de zonas de firma por layout y palabras clave
                    lower_text = text.lower()
                    if any(kw in lower_text for kw in signature_keywords):
                        # Inferir bounding box para la firma (zona sobre o bajo la línea de firma)
                        min_x = min(pt[0] for pt in coords)
                        max_x = max(pt[0] for pt in coords)
                        min_y = min(pt[1] for pt in coords)
                        max_y = max(pt[1] for pt in coords)

                        # Expandir verticalmente para capturar la rúbrica / sello
                        width = max_x - min_x
                        sig_x1 = max(0, int(min_x - 20))
                        sig_y1 = max(0, int(min_y - 120)) # Espacio para la firma arriba de la línea
                        sig_x2 = min(img.width, int(max_x + 20))
                        sig_y2 = min(img.height, int(max_y + 40))

                        if (sig_x2 - sig_x1) > 40 and (sig_y2 - sig_y1) > 30:
                            crop_img = img.crop((sig_x1, sig_y1, sig_x2, sig_y2))
                            buffered = io.BytesIO()
                            crop_img.save(buffered, format="PNG")
                            img_b64 = base64.b64encode(buffered.getvalue()).decode("utf-8")

                            all_signatures.append(
                                DetectedSignature(
                                    signature_id=str(uuid.uuid4()),
                                    page_number=page_idx,
                                    box=BoundingBox(x1=sig_x1, y1=sig_y1, x2=sig_x2, y2=sig_y2),
                                    confidence=round(conf_float, 4),
                                    image_base64=img_b64
                                )
                            )

            all_blocks.extend(page_blocks)

        avg_conf = round(float(np.mean(confidences)), 4) if confidences else 1.0
        raw_text = "\n".join(full_text_parts)

        return OcrExtractionResponse(
            success=True,
            total_pages=total_pages,
            average_confidence=avg_conf,
            raw_text=raw_text,
            blocks=all_blocks,
            signatures=all_signatures
        )

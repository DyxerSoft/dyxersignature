from typing import List, Optional
from pydantic import BaseModel, Field

class BoundingBox(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int

class OcrTextBlock(BaseModel):
    text: str
    confidence: float
    box: List[List[int]] = Field(default_factory=list, description="Coordenadas poligonales [[x,y],...]")

class DetectedSignature(BaseModel):
    signature_id: str
    page_number: int
    box: BoundingBox
    confidence: float
    image_base64: str

class OcrExtractionResponse(BaseModel):
    success: bool
    total_pages: int
    average_confidence: float
    raw_text: str
    blocks: List[OcrTextBlock] = Field(default_factory=list)
    signatures: List[DetectedSignature] = Field(default_factory=list)
    engine: str = "PaddleOCR"

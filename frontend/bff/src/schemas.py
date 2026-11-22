from typing import List, Optional
from pydantic import BaseModel, Field

class BoundingBox(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int

class DetectedSignatureModel(BaseModel):
    id: str
    pageNumber: int
    boundingBox: str
    confidence: float
    cropStorageKey: str

class IngestScanInitResponse(BaseModel):
    contractId: str
    digitizationJobId: str
    status: str
    fileName: str

class BlockchainInfo(BaseModel):
    status: str = "Pending"
    transactionHash: Optional[str] = None
    blockNumber: Optional[int] = None

class DigitizationJobResponse(BaseModel):
    digitizationJobId: str
    status: str
    errorMessage: Optional[str] = None
    confidenceScore: float
    requiresReview: bool
    extractedTextSummary: Optional[str] = None
    signaturesDetected: List[DetectedSignatureModel] = Field(default_factory=list)
    generatedDocumentVersionId: Optional[str] = None
    documentHash: Optional[str] = None
    versionStatus: Optional[str] = None
    blockchain: Optional[BlockchainInfo] = None

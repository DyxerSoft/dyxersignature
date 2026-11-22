import os
import logging
from typing import Optional, Dict, Any
import httpx

logger = logging.getLogger("backend_client")

BACKEND_API_URL = os.getenv("BACKEND_API_URL", "http://backend:8080/api/v1")

class BackendClient:
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or BACKEND_API_URL).rstrip("/")

    async def register_signed_version(
        self,
        contract_id: str,
        filename: str,
        file_bytes: bytes,
        correction_reason: Optional[str] = None
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/contracts/{contract_id}/versions/signed"
        data = {}
        if correction_reason:
            data["correctionReason"] = correction_reason

        files = {
            "file": (filename, file_bytes, "application/pdf" if filename.lower().endswith(".pdf") else "image/png")
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(url, data=data, files=files)
                if response.status_code >= 400:
                    logger.warning(f"Error {response.status_code} desde el backend al registrar versión: {response.text}")
                    return {"status": "BackendWarning", "detail": response.text}
                return response.json()
            except Exception as ex:
                logger.error(f"No se pudo conectar con el backend en {url}: {ex}")
                return {"status": "BackendUnavailable", "detail": str(ex)}

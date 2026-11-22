import os
import logging
from typing import Optional, Dict, Any

import httpx

logger = logging.getLogger("backend_client")
BACKEND_API_URL = os.getenv("BACKEND_API_URL", "http://api:8080/api/v1")


class BackendClient:
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or BACKEND_API_URL).rstrip("/")

    async def register_signed_version(
        self,
        contract_id: str,
        filename: str,
        file_bytes: bytes,
        correction_reason: Optional[str] = None,
        authorization: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Register an OCR result as a DRAFT in the real Stellar .NET API.

        A qualified/digital signature is NOT performed by this method. The
        frontend must explicitly review and sign the version afterwards.
        """
        if not authorization or not authorization.startswith("Bearer "):
            return {"status": "AuthenticationRequired", "detail": "JWT requerido para registrar el PDF."}
        url = f"{self.base_url}/contracts/{contract_id}/versions"
        data = {}
        if correction_reason:
            data["correctionReason"] = correction_reason

        files = {"file": (filename, file_bytes, "application/pdf")}
        headers = {"Authorization": authorization}

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(url, data=data, files=files, headers=headers)
                if response.status_code >= 400:
                    logger.warning("Error %s from .NET draft upload for contract %s", response.status_code, contract_id)
                    return {"status": "BackendWarning", "httpStatus": response.status_code}
                return response.json()
            except httpx.RequestError:
                logger.exception("No se pudo conectar con el backend .NET para el contrato %s", contract_id)
                return {"status": "BackendUnavailable", "detail": "No se pudo conectar con la API de contratos."}

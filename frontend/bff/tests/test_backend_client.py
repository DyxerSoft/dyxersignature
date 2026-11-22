"""Contract smoke for the optional OCR BFF without installing PaddleOCR."""
import asyncio
import importlib
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

BFF_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BFF_ROOT))

calls = []
status_code = 201

class FakeResponse:
    @property
    def status_code(self):
        return status_code

    def json(self):
        return {"documentVersionId": "fake-version", "documentHash": "f" * 64}

class FakeAsyncClient:
    def __init__(self, timeout):
        self.timeout = timeout

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, **kwargs):
        calls.append((url, kwargs))
        return FakeResponse()

httpx_stub = types.ModuleType("httpx")
httpx_stub.AsyncClient = FakeAsyncClient
httpx_stub.RequestError = type("RequestError", (Exception,), {})
with patch.dict(sys.modules, {"httpx": httpx_stub}):
    backend_client = importlib.import_module("src.backend_client")

class BackendClientTests(unittest.TestCase):
    def setUp(self):
        global status_code
        calls.clear()
        status_code = 201

    def test_stellar_draft_endpoint_and_jwt_forwarding(self):
        result = asyncio.run(backend_client.BackendClient("http://api:8080/api/v1")
            .register_signed_version("contract-123", "scan.pdf", b"%PDF-test",
                                     authorization="Bearer demo-token"))
        self.assertEqual(result["documentVersionId"], "fake-version")
        self.assertEqual(len(calls), 1)
        url, kwargs = calls[0]
        self.assertEqual(url, "http://api:8080/api/v1/contracts/contract-123/versions")
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer demo-token")
        self.assertEqual(kwargs["files"]["file"][2], "application/pdf")

    def test_reject_anonymous_submission(self):
        result = asyncio.run(backend_client.BackendClient()
            .register_signed_version("contract-123", "scan.pdf", b"fake"))
        self.assertEqual(result["status"], "AuthenticationRequired")
        self.assertEqual(calls, [])

    def test_backend_error_not_reported_as_signed(self):
        global status_code
        status_code = 404
        result = asyncio.run(backend_client.BackendClient("http://api:8080/api/v1")
            .register_signed_version("contract-123", "scan.pdf", b"%PDF-test",
                                     authorization="Bearer demo-token"))
        self.assertEqual(result["status"], "BackendWarning")
        self.assertEqual(result["httpStatus"], 404)

if __name__ == "__main__":
    unittest.main()

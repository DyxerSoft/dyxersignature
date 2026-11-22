# ADR-003 — Motor OCR mediante Sidecar PaddleOCR en Python

**Estado:** Accepted

## Contexto

DyxerSignature requiere digitalizar documentos físicos y extraer texto y coordenadas (*bounding boxes*) con alta fidelidad para sustentar la evidencia documental antes de la firma digital y el anclaje blockchain. El backend principal es ASP.NET Core sobre .NET 10 LTS.

Se seleccionó la biblioteca PaddlePaddle/PaddleOCR por su desempeño superior en detección de texto multilínea, extracción de tablas y reconocimiento en español e inglés. No obstante, PaddleOCR es nativo del ecosistema Python/C++, careciendo de librerías oficiales de alto nivel para .NET 10.

## Decisión

El motor de OCR se implementará como un servicio auxiliar desacoplado (*Sidecar*) en `backend/ocr/` utilizando Python y FastAPI:

- El código y dependencias de PaddleOCR residirán exclusivamente en `backend/ocr/`, manteniendo `backend/DyxerSignature.slnx` libre de dependencias de Python.
- El servicio se empaquetará en su propio contenedor Docker (`ocr-service`), exponiendo un endpoint interno HTTP (`POST /api/v1/ocr/extract`).
- En el backend .NET, el nuevo módulo `Ingestion` definirá el puerto `IOcrEngineGateway`, implementado en `Infrastructure` mediante `PaddleOcrHttpClient`.
- Los pesos de los modelos de inferencia se descargarán al inicio y se persistirán en un volumen de Docker (`paddle_models`) para evitar re-descargas en reinicios.
- Ningún dato extraído por OCR ni PII se enviará a la blockchain. La blockchain solo registrará el hash SHA-256 del PDF/A canónico resultante y su manifiesto de evidencia.

## Consecuencia

- Máximo aislamiento: las actualizaciones o parches de librerías de visión por computadora no impactan la compilación ni el ciclo de vida del API de .NET.
- Asignación de recursos independiente: el contenedor de OCR puede limitarse o escalarse en CPU/GPU sin interferir con la latencia transaccional del monolito.
- Se requiere orquestación mediante Docker Compose (`docker-compose.local.yml`) para el desarrollo local completo.

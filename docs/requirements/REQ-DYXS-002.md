# REQ-DYXS-002 — Ingesta de documentos escaneados y digitalización con PaddleOCR

**Estado:** Especificado para implementación.

## Objetivo

Extender el ciclo documental para admitir la ingesta de archivos escaneados o imágenes (PDF rasterizado, PNG, JPEG), extraer texto y coordenadas mediante el motor PaddleOCR, detectar y recortar regiones de firmas manuscritas o sellos (análisis de layout), estructurar los metadatos de digitalización, generar un documento canónico PDF/A con capa de texto y transferirlo al pipeline de firma, SHA-256, Evidence Manifest y anclaje blockchain ya validado en `REQ-DYXS-001`.

## Flujo

```text
Documento físico / Escáner (PDF raster / PNG / JPEG)
  │
  ▼
POST /api/v1/contracts/{id}/ingest/scan
  │
  ├─ Validación MIME y magic bytes
  ├─ Guardado temporal en Storage
  └─ Creación de DigitizationJob (PENDING)
        │
        ▼
  IOcrEngineGateway (PaddleOCR Sidecar HTTP)
        │
        ▼
  Extracción estructurada
  ├─ Texto por línea y bloque
  ├─ Coordenadas (bounding boxes)
  ├─ Detección de firmas manuscritas y sellos (layout analysis)
  ├─ Generación de recortes de firmas (signature_crops)
  └─ Score de confianza (0.0 - 1.0)
        │
        ▼
  Evaluación de confianza
  ├─ Confianza >= 0.85 -> Generación PDF/A canónico con capa de texto
  └─ Confianza < 0.85  -> Marcado REQUIRES_REVIEW (Human-in-the-loop)
        │
        ▼
  PDF/A CANÓNICO DEFINITIVO
        │
        ├─ SHA-256 del documento
        ├─ Evidence Manifest (con metadatos de escaneo, firmas y hash OCR)
        └─ Audit Trail (DOCUMENT_SCANNED, OCR_PROCESSED)
        │
        ▼
  Outbox -> Blockchain Gateway -> Polygon Anchor -> ACTIVE
```

## Criterios de aceptación

- [x] Crear módulo `Ingestion` en backend (`Modules/Ingestion/`).
- [x] Implementar servicio de inferencia en `backend/ocr/` con FastAPI y PaddleOCR (PP-OCRv4 + Layout Analysis).
- [x] Persistir pesos de PaddleOCR mediante volumen Docker (`paddle_models`).
- [x] Definir contrato de comunicación `IOcrEngineGateway` en .NET.
- [x] Implementar adaptador `PaddleOcrHttpClient` con resiliencia y timeouts configurables.
- [x] Aceptar cargas multipart en `POST /api/v1/contracts/{id}/ingest/scan` con validación de magic bytes (PDF, PNG, JPEG).
- [x] Rechazar archivos no soportados con RFC 9457 Problem Details.
- [x] Detectar regiones de firmas manuscritas o sellos mediante análisis de layout en documentos e imágenes escaneadas.
- [x] Extraer y persistir el recorte de imagen de cada firma detectada (*bounding box crop*) vinculado al registro de digitalización para visualización en UI.
- [x] Persistir registros de digitalización (`digitization_records`) con texto extraído, coordenadas JSON, firmas detectadas y score de confianza promedio.
- [x] Generar un PDF/A canónico que integre la imagen escaneada y la capa de texto OCR invisible para búsqueda y accesibilidad.
- [x] Calcular SHA-256 sobre el PDF/A generado y enlazarlo como nueva versión en el módulo `Contracts`.
- [x] Construir el `EvidenceManifest` incluyendo el hash de los metadatos de digitalización, firmas detectadas y el `ocrEngineVersion`.
- [x] Encolar anclaje en el `Transactional Outbox` hacia la blockchain.
- [x] Registrar eventos de auditoría append-only para cada etapa de la digitalización.

## API de prueba

### Iniciar digitalización de documento escaneado

```bash
curl -X POST \
  -F "file=@contrato_escaneado.png;type=image/png" \
  http://localhost:8081/api/v1/contracts/{contractId}/ingest/scan
```

Respuesta esperada (HTTP 202 Accepted):

```json
{
  "contractId": "03e6154b-0336-451f-803a-897443e09791",
  "digitizationJobId": "c8b1a45e-4078-4395-97e3-0824b2149b51",
  "status": "Processing",
  "fileName": "contrato_escaneado.png"
}
```

### Consultar estado de digitalización y resultado OCR

```http
GET /api/v1/contracts/{contractId}/ingest/{digitizationJobId}
```

Respuesta esperada al completar:

```json
{
  "digitizationJobId": "c8b1a45e-4078-4395-97e3-0824b2149b51",
  "status": "Completed",
  "confidenceScore": 0.94,
  "requiresReview": false,
  "extractedTextSummary": "CONTRATO PRIVADO DE PRESTACIÓN DE SERVICIOS...",
  "signaturesDetected": [
    {
      "pageNumber": 1,
      "boundingBox": [120, 450, 310, 520],
      "confidence": 0.92,
      "cropStorageKey": "contracts/03e6154b/ingest/c8b1a45e/signatures/sig_p1_1.png"
    }
  ],
  "generatedDocumentVersionId": "e2a39d84-90f7-418b-a482-628d0879e961",
  "documentHash": "4e1a7b8893d5...32bytes",
  "versionStatus": "Active"
}
```

## Modos de ejecución

### Modo Simulado (Local / CI)

Si `Ocr__Mode=Simulated`, el gateway devuelve una respuesta sintética inmediata con texto y coordenadas dummy para smoke tests sin requerir levantar el modelo de Deep Learning.

### Modo Real (PaddleOCR)

Cuando `Ocr__Mode=Http`, se invoca al servicio `http://ocr-service:8000/api/v1/ocr/extract`. El servicio ejecuta detección de texto (DBNet) y reconocimiento (CRNN) con PP-OCRv4.

## Limitaciones intencionales del slice

- La corrección manual de campos por interfaz de usuario (Human-in-the-loop Workbench) se implementará en una fase visual posterior; este slice marcará el flag `requiresReview` cuando el umbral sea inferior al 85%.
- La conversión a PDF/A utilizará una capa básica de texto estructurado; filtros de mejora de imagen avanzados (despeckle, binarización adaptativa Otsu) se afinarán en slices futuros.

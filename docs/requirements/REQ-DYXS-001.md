# REQ-DYXS-001 — Versionado documental y anclaje Stellar

**Estado:** APIs, frontend y adaptador Testnet implementados en `feat/stellar-hackathon-mvp`. El backend CI y el smoke test Testnet pasan. La ejecución completa del flujo con Compose y un PDF sigue pendiente.

## Objetivo

Mantener versiones documentales inmutables de un contrato lógico, con SHA-256, evidencia, firmantes, auditoría y anclaje verificable. Solo una versión confirmada puede convertirse en vigente. Una corrección crea una versión nueva.

## Flujo

```text
Create Contract
  -> Upload PDF to private SeaweedFS S3
  -> SHA-256 of stored bytes
  -> Review the displayed hash
  -> Record signer event and evidence
  -> Persist idempotent Outbox message
  -> Prepare and persist signed Stellar envelope
  -> Submit asynchronously to Stellar Testnet
  -> Verify transaction hash and Manage Data value
  -> Activate version and issue authorized temporary download URL
```

Stellar recibe solo el SHA-256 hexadecimal del PDF final; no se publican archivos, datos del contrato ni datos personales.

## Implementación y evidencia

| Capacidad | Código | Evidencia disponible |
|---|---|---|
| Contratos, versiones, correcciones, revisión, firma y auditoría | Controllers modulares, entidades EF Core y migraciones | Build y pruebas .NET pasan en CI `45034897263` |
| Dashboard persistido y comparación de hashes | `/api/v1/dashboard` y `/documents/compare` | CI de backend pasa; no hay ejecución local por ausencia de Docker/.NET |
| Outbox idempotente, leases y retry del mismo envelope | `BlockchainOutboxWorker` + entidad `OutboxMessage` | CI de backend pasa |
| Stellar Testnet y verificación de operación `Manage Data` | `StellarBlockchainGateway` | Smoke CI `45034897292` pasó; [transaction hash en Horizon](https://horizon-testnet.stellar.org/transactions/c3face26a35ba4aaa2b72378e7672a410722941f762556ca053a2916c1b249b3), ledger `5867071` |
| SeaweedFS S3 privado y URL prefirmada | `S3DocumentStorage` | Compilación Docker pasa; descarga desde Compose aún no probada |
| Flujo de navegador con PDF real y firma | `frontend/src/features/contracts/ContractWorkbench.tsx` | Build de frontend local pasa; recorrido de navegador aún no probado |

## Endpoints

- `POST /api/v1/contracts` — crear contrato.
- `POST /api/v1/contracts/{id}/versions` — cargar PDF como nueva versión.
- `POST /api/v1/contracts/{id}/versions/{versionId}/review` — confirmar hash revisado.
- `POST /api/v1/contracts/{id}/versions/{versionId}/sign` — registrar firmante y encolar Stellar.
- `GET /api/v1/contracts/{id}` — detalle, versiones, estados y transaction hashes.
- `GET /api/v1/contracts/{id}/documents/compare` — comparar hashes y metadatos.
- `GET /api/v1/contracts/{id}/versions/{versionId}/verify` — recalcular PDF y verificar transacción.
- `GET /api/v1/documents/{versionId}/download` — obtener enlace S3 temporal tras autenticación.

## Límites

- El evento de firma acredita una declaración del usuario autenticado; no es una firma electrónica cualificada ni valida identidad mediante certificado.
- La comparación informa cambios de SHA-256/metadatos; no produce un diff visual de PDF.
- El smoke Testnet prueba el adaptador con un hash sintético. El anclaje de un documento de demostración requiere ejecutar Compose con una cuenta Testnet configurada.


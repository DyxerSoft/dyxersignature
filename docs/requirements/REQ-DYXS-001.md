# REQ-DYXS-001 — Versionado documental con anclaje blockchain

**Estado:** Implementado como vertical slice técnico inicial.

## Objetivo

Demostrar de extremo a extremo que un contrato lógico puede mantener múltiples versiones documentales inmutables, cada una con SHA-256, Evidence Manifest y Blockchain Anchor, manteniendo solo una versión vigente.

## Flujo

```text
Create Contract
  -> Upload signed PDF
  -> Local immutable storage
  -> SHA-256
  -> Evidence Manifest
  -> Outbox
  -> Blockchain Gateway
  -> Confirm anchor
  -> Activate version
```

Cuando existe una versión vigente:

```text
V1 ACTIVE
  -> create V2
  -> V2 blockchain confirmed
  -> V1 SUPERSEDED
  -> V2 ACTIVE
```

## Criterios de aceptación

- [x] Crear contrato lógico.
- [x] Adjuntar PDF firmado de prueba.
- [x] Rechazar streams que no comiencen con firma PDF.
- [x] Guardar cada PDF en una ruta distinta por contrato y versión.
- [x] Calcular SHA-256 sobre bytes guardados.
- [x] Generar Evidence Manifest determinista.
- [x] Calcular SHA-256 del Evidence Manifest.
- [x] Crear BlockchainAnchor por versión.
- [x] Crear mensaje Outbox en la misma persistencia operacional.
- [x] Worker asíncrono procesa el anchor.
- [x] Gateway simulado para smoke test sin infraestructura externa.
- [x] Gateway Nethereum para Anvil/Polygon mediante configuración.
- [x] Activar la versión solo después de confirmación.
- [x] Marcar la versión activa previa como SUPERSEDED.
- [x] Exponer histórico completo por contrato.
- [x] Persistir auditoría de creación, recepción y activación.

## API de prueba

### Crear contrato

```http
POST /api/v1/contracts
Content-Type: application/json

{
  "businessReference": "GP-TEST-0001"
}
```

### Adjuntar primera versión

```bash
curl -X POST \
  -F "file=@contrato-v1.pdf;type=application/pdf" \
  http://localhost:8080/api/v1/contracts/{contractId}/versions/signed
```

### Adjuntar corrección

```bash
curl -X POST \
  -F "file=@contrato-v2.pdf;type=application/pdf" \
  -F "correctionReason=Corrección de datos del cliente" \
  http://localhost:8080/api/v1/contracts/{contractId}/versions/signed
```

### Consultar estado

```http
GET /api/v1/contracts/{contractId}
```

Esperado luego del worker:

```text
V2 ACTIVE
V1 SUPERSEDED
```

## Modos blockchain

### Simulated

Modo por defecto en Development. Permite validar el flujo sin depender de RPC.

### Anvil

1. Ejecutar `anvil`.
2. Desplegar `DocumentAnchor.sol`:

```bash
cd backend/blockchain
forge create src/DocumentAnchor.sol:DocumentAnchor \
  --rpc-url http://127.0.0.1:8545 \
  --private-key <ANVIL_PRIVATE_KEY>
```

3. Configurar `Blockchain__Mode=Rpc`, `Blockchain__ContractAddress` y `Blockchain__PrivateKey`.
4. Reiniciar API y repetir el flujo.

## Limitaciones intencionales del slice

- La firma digital real todavía no está integrada; se recibe un PDF ya firmado.
- `EnsureCreated` se usa únicamente en Development para el PoC. Antes de staging se reemplazará por migraciones EF Core.
- El storage local se sustituirá por object storage antes de producción.
- El worker está diseñado para una instancia. El escalado horizontal requerirá claim/locking de Outbox.
- La recuperación de una TX minada cuando el proceso cae antes de persistir el receipt se endurecerá consultando eventos on-chain.

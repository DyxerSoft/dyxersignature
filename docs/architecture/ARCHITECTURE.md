# Arquitectura — DyxerSignature

## Estilo

DyxerSignature se implementa como **monolito modular**:

- un frontend React;
- un backend ASP.NET Core;
- una base PostgreSQL;
- un proceso desplegable para la API, incluyendo workers hospedados;
- Stellar Testnet para registrar y verificar el SHA-256 de cada PDF definitivo.

No se utilizarán microservicios en el MVP.

## Flujo funcional

```text
CLIENTE
  ├─ CI
  ├─ teléfono/email
  ├─ OTP
  ├─ visualización obligatoria
  ├─ aceptación expresa
  └─ IP + dispositivo + timestamp
        │
        ▼
PDF definitivo
        │
        ▼
Firma digital del representante autorizado de Grupo Paz
        │
        ▼
PDF FINAL FIRMADO
        │
        ├─ SHA-256
        ├─ Evidence Manifest
        └─ Audit Trail
        │
        ▼
Outbox
        │
        ▼
Blockchain Worker
        │
        ▼
Stellar Testnet
        │
        ▼
Blockchain Receipt
```

## Modelo de versiones

```text
Contract
├─ Version 1 ─ SUPERSEDED ─ Stellar TX A
├─ Version 2 ─ SUPERSEDED ─ Stellar TX B
├─ Version 3 ─ SUPERSEDED ─ Stellar TX C
└─ Version 4 ─ ACTIVE ───── Stellar TX D
```

Una corrección jamás modifica una versión ya firmada. Crea una versión nueva del mismo contrato lógico.

## Módulos backend

```text
DyxerSignature.Api
├─ Common
├─ Infrastructure
└─ Modules
   ├─ Contracts
   ├─ Documents
   ├─ Signatures
   ├─ Evidence
   ├─ Blockchain
   └─ Audit
```

### Contracts
Dueño del contrato lógico, máquina de estados, versionado, sustituciones y versión vigente.

### Documents
Generación/custodia del PDF, hash SHA-256 y referencias de almacenamiento.

### Signatures
Orquesta evidencia de cliente y la integración de firma digital corporativa. No contiene lógica blockchain.

### Evidence
Construye el Evidence Manifest, su canonicalización y su hash.

### Blockchain
Stellar SDK, Horizon Testnet, preparación persistida de sobre firmado, envío idempotente, confirmación, verificación y reintentos con Outbox.

### Audit
Registro append-only de eventos operativos y de seguridad.

## Invariantes

1. Un contrato puede tener N versiones documentales.
2. Solo una versión puede estar `ACTIVE`.
3. Una versión `BLOCKCHAIN_CONFIRMED` es inmutable en contenido, hash y evidencia.
4. Una versión nueva no invalida físicamente la anterior; la marca `SUPERSEDED`.
5. La nueva versión reemplaza a la vigente solo después de completar firma y anclaje.
6. Blockchain no contiene PII ni el PDF.
7. El hash se calcula sobre los bytes exactos del PDF final firmado.
8. El anclaje blockchain no bloquea el flujo HTTP: se procesa por Outbox/Worker.
9. Todas las fechas internas se almacenan en UTC.
10. Toda operación sensible genera un evento de auditoría.

## Persistencia

Tablas conceptuales iniciales:

- `contracts`
- `contract_document_versions`
- `blockchain_anchors`
- `evidence_manifests`
- `audit_events`
- `outbox_messages`
- `signature_events`

## Estado contractual vs. estado documental

Contrato:
`DRAFT -> IN_SIGNATURE -> ACTIVE -> CANCELLED/CLOSED`

Versión:
`DRAFT -> CLIENT_ACCEPTED -> GP_SIGNATURE_PENDING -> SIGNED -> BLOCKCHAIN_PENDING -> BLOCKCHAIN_SUBMITTED -> BLOCKCHAIN_CONFIRMED -> ACTIVE`

Una versión vigente puede pasar a `SUPERSEDED` cuando otra versión ya fue confirmada y activada.

## Integraciones

Todas las integraciones externas se consumen detrás de interfaces:

- `IBlockchainGateway`
- `IDigitalSignatureGateway`
- `IDocumentStorage`
- `IOtpGateway`

El dominio no depende directamente de SDKs externos. La blockchain recibe únicamente hashes; archivos y datos de firmantes quedan fuera del ledger.


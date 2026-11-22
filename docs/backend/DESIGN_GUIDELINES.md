# Lineamientos backend

## Principios

1. **Monolito modular:** un solo deploy, separación fuerte por dominio.
2. **Feature-first:** código agrupado por módulo, no una carpeta global gigante de Controllers/Services/Repositories.
3. **Dominio independiente:** entidades y reglas no dependen de EF Core, Stellar SDK ni HTTP.
4. **Infraestructura por adaptadores:** integraciones externas detrás de interfaces.
5. **Append-only para evidencia:** no se actualizan hashes, PDFs firmados ni receipts confirmados.
6. **Idempotencia obligatoria:** reintentar no debe duplicar anclajes.
7. **Outbox:** Stellar nunca debe formar parte de la transacción HTTP del usuario.
8. **UTC:** persistencia temporal exclusivamente UTC.
9. **Problem Details:** errores HTTP con RFC 9457/ProblemDetails; no excepciones crudas.
10. **Correlación:** cada flujo debe transportar `correlation_id`.

## Estructura por módulo

```text
Modules/<Module>/
├─ Domain/
├─ Application/
├─ Infrastructure/
└─ Api/
```

- **Domain:** entidades, value objects, invariantes, enums.
- **Application:** casos de uso, commands/queries, interfaces.
- **Infrastructure:** EF Core, proveedores, clientes externos.
- **Api:** endpoints y DTOs de transporte.

No se permite que un módulo modifique directamente las tablas propiedad de otro módulo. La coordinación se realiza mediante casos de uso y eventos internos.

## Persistencia

- PostgreSQL como fuente de verdad del estado operacional.
- EF Core para persistencia.
- Índice único parcial: una sola versión `ACTIVE` por `contract_id`.
- Migraciones versionadas en Git.
- Nunca almacenar semillas/secretos de Stellar en tablas de aplicación.
- PDFs en object storage; la DB conserva referencias y hashes.

## Blockchain

El módulo Blockchain debe exponer una abstracción, no el SDK Stellar al resto del sistema:

```csharp
IBlockchainGateway
  PrepareDocumentAsync(hash, ...)
  SubmitPreparedDocumentAsync(envelope, ...)
  VerifyDocumentAsync(hash, transactionHash, ...)
```

Estados: `PENDING, SUBMITTED, CONFIRMED, FAILED`.

El estado actual y el versionado pertenecen a PostgreSQL. Stellar Testnet recibe únicamente el hash SHA-256 del PDF final.

## Seguridad

- Secretos por secret manager/KMS en entornos reales.
- No PII on-chain.
- Wallet corporativa separada de la clave/certificado usado para firmar PDFs.
- Logs sin OTP, tokens, private keys ni contenido de documentos.
- Rate limiting en OTP, verificación y endpoints públicos.
- Authorization policy basada en roles/capacidades.
- Hash: SHA-256 de bytes exactos, sin regenerar el PDF para verificarlo.

## Calidad

- Nullable habilitado.
- TreatWarningsAsErrors en CI.
- Tests unitarios para invariantes.
- Tests de integración con PostgreSQL real/container.
- Smoke test real de Stellar Testnet con una clave efímera, fuera de las pruebas unitarias normales.
- SAST, dependency scanning y secret scanning en CI.


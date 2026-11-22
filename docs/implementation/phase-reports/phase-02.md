# Fase 2 — Módulos de negocio

## Entrega

Contratos autenticados con listado paginado, detalle e histórico, título editable, baja lógica, creación de versiones PDF inmutables, motivo de corrección, revisión ligada al SHA-256 exacto, registro de firma, comparación de versiones, verificación de objeto y endpoint de descarga prefirmada con auditoría. Se añadieron métricas persistidas del dashboard, consultas de auditoría y trazabilidad de firmantes, migración para permitir el mismo hash documental en más de un contrato y pruebas unitarias de dominio.

La revisión y la firma son pasos explícitos. La aplicación registra quién confirmó la revisión y quién declara la firma; el MVP no genera una firma criptográfica ni valida un certificado de identidad. La firma se representa mediante la entrega del documento definitivo y un evento de firmante asociado a sus bytes.

## Commit

Se registrará en `feat/stellar-hackathon-mvp` después de validación y push; añadir aquí SHA y resultado CI. `main` no se modifica.

## Archivos principales

- Backend de negocio: `ContractsController`, `ContractDocumentVersion`, `DashboardController`, `DocumentsController`, `SignaturesController`, `AuditController`.
- Persistencia: `AppDbContext`, migraciones `202611220001_InitialMvp` y `202611220002_AllowRepeatedDocumentHashes`.
- Almacenamiento: contrato `IDocumentStorage` y `S3DocumentStorage`; no existe operación de borrado de objetos.
- Pruebas: `backend/tests/DyxerSignature.Api.Tests`.
- Infraestructura: Dockerfile actualizado para restaurar paquetes en `publish`; `Program.cs` conserva claims `sub` para auditar al actor autenticado.
- Flujo multiagente: resultado de análisis y matriz de diez criterios en `docs/implementacion/requerimientos/MVP-001/evidence/analysis-attempt-01.md` y `results/analysis-attempt-01.json`.

## Pruebas y resultados

- `npm run build`: correcto.
- `python scripts/validar_flujo.py`: correcto.
- `python scripts/validar_requirement_loop.py --requirement MVP-001`: correcto; el despacho de análisis permanece `ANALYZING`.
- `python scripts/probar_requirement_loop.py`: 20 correctas, 2 omitidas por límites de symlink/chmod en Windows.
- JSON de `appsettings.json` y YAML de Compose: parsean correctamente.
- .NET y Docker locales: no están instalados. `dotnet test`, `docker compose config` y runtime local no ejecutables; se esperará CI para build y pruebas .NET.
- CI de esta fase: registrar los dos workflows y su resultado tras el push.

## Bloqueos y límites

- La API representa la firma por un evento verificable asociado a un PDF ya firmado externamente; no implementa certificado digital ni un proveedor de firma electrónica.
- Compose, SeaweedFS, descarga y persistencia requieren validación runtime; no declarar aceptados esos gates hasta observarlos.
- El adaptador Stellar, recuperación de transaction hash, métricas de capacidad, carga de 100 usuarios y transacción Testnet pertenecen a fases posteriores.
- La reserva del harness para `analysis_agent` tiene un resultado y artefacto, pero no se materializó una asociación de sesión: la herramienta de delegación disponible expone un nombre de tarea y no el `SESSION_ID` requerido por `bind`. El estado conserva `ANALYZING`; no se inventó un recibo ni se calificó ninguna fase.

## Siguiente fase

Integrar Stellar Testnet real detrás del Outbox, con efecto idempotente por hash y recuperación del transaction hash tras un reintento; después conectar las nuevas rutas al mockup existente.


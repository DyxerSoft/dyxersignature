# DyxerSignature

Sistema monolítico modular para contratos, firmas, evidencia y trazabilidad documental de Grupo Paz.

## Stack

- Frontend: React 19, TypeScript y Vite.
- Backend: ASP.NET Core sobre .NET 10.
- Persistencia: PostgreSQL con migraciones EF Core y auditoría append-only.
- Archivos: bucket S3 privado en SeaweedFS, con objetos de versiones inmutables y URLs prefirmadas breves.
- Blockchain: Stellar Testnet para anclar y verificar hashes SHA-256 mediante Transactional Outbox.
- API: REST autenticada, validaciones, logs JSON y Swagger/OpenAPI.

## Inicio local

1. Copia `.env.example` a `.env` y sustituye los valores de demostración por credenciales locales aleatorias. No guardes el archivo `.env` en Git.
2. Si vas a enviar anclajes de documentos a Testnet, configura `STELLAR_PUBLIC_KEY` y `STELLAR_SECRET_SEED` desde una cuenta financiada en Stellar Testnet. Sin la semilla, la API sigue aceptando solicitudes y la cola informa reintentos pendientes.
3. Inicia el sistema:

   ```bash
   docker compose up --build
   ```

4. Abre `http://localhost:3000`. Swagger/OpenAPI está en `http://localhost:8080/swagger` y el health check en `http://localhost:8080/api/v1/health`.

La sesión de demostración usa `/api/v1/auth/dev-token`, disponible solo con `ASPNETCORE_ENVIRONMENT=Development`; no es un proveedor de identidad de producción. Guía completa: [docs/implementation/demo-guide.md](docs/implementation/demo-guide.md).

## Recorrido funcional

```text
Contrato → PDF privado → versión → revisión del hash → firma y auditoría
         → Outbox → transacción Stellar Testnet → verificación → descarga autorizada
```

El ledger recibe únicamente el SHA-256 del PDF definitivo. El archivo, los firmantes, los correos y los identificadores comerciales permanecen fuera de Stellar. Las correcciones agregan versiones; no se sobrescriben ni se eliminan los archivos anteriores.

## Documentación

- [Plan y reportes por fase](docs/implementation/phase-plan.md)
- [Cierre de fase 5: carga y Testnet end-to-end](docs/implementation/phase-reports/phase-05.md)
- [Guía de demostración](docs/implementation/demo-guide.md)
- [Flujo Stellar Testnet y smoke test](backend/blockchain/README.md)
- [Prueba de carga reproducible](docs/implementation/load-test.md)
- API interactiva: `/swagger`


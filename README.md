# DyxerSignature

Sistema monolítico modular para firma, evidencia y trazabilidad documental de Grupo Paz.

## Stack base

- Frontend: React 19 + TypeScript + Vite.
- Backend: ASP.NET Core sobre .NET 10 LTS.
- Persistencia: PostgreSQL + Entity Framework Core.
- Blockchain: Polygon PoS mediante Nethereum.
- Smart contracts: Solidity + Foundry.
- Integridad: SHA-256.
- Auditoría: eventos append-only.
- Consistencia asíncrona: Transactional Outbox para el anclaje blockchain.

## Estructura

```text
dyxersignature/
├── frontend/
├── backend/
│   ├── src/DyxerSignature.Api/
│   └── blockchain/
├── docs/
│   ├── architecture/
│   ├── backend/
│   ├── frontend/
│   └── adr/
└── docker-compose.yml
```

El backend es un único artefacto desplegable. Los módulos internos separan responsabilidades de dominio sin convertir el sistema en microservicios.

## Regla de dominio principal

Un contrato lógico puede tener N versiones documentales firmadas. Cada versión firmada es inmutable y mantiene su PDF, SHA-256, evidencia, auditoría y anclaje Polygon. Solo una versión por contrato puede estar vigente.

## Desarrollo local

### Base de datos

```bash
docker compose up -d postgres
```

### Backend

```bash
cd backend
dotnet restore DyxerSignature.slnx
dotnet run --project src/DyxerSignature.Api/DyxerSignature.Api.csproj
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Documentación principal: `docs/architecture/ARCHITECTURE.md`.

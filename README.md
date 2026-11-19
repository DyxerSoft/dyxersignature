# DyxerSignature

Sistema monolítico modular para firma, evidencia y trazabilidad documental de Grupo Paz.

## Stack base

- Frontend: React 19 + TypeScript + Vite.
- Backend: ASP.NET Core sobre .NET 10 LTS.
- Persistencia: PostgreSQL + Entity Framework Core.
- Blockchain: Polygon PoS / Anvil mediante Nethereum.
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
│   ├── requirements/
│   └── adr/
└── docker-compose.yml
```

El backend es un único artefacto desplegable. Los módulos internos separan responsabilidades de dominio sin convertir el sistema en microservicios.

## REQ-DYXS-001

El primer vertical slice ya cubre:

```text
Contrato
  -> PDF firmado de prueba
  -> SHA-256
  -> Evidence Manifest
  -> Outbox
  -> Blockchain Gateway
  -> Confirmación
  -> ACTIVE
```

Al confirmar una V2, V3, etc., la versión ACTIVE anterior pasa automáticamente a SUPERSEDED.

Ver `docs/requirements/REQ-DYXS-001.md`.

## Desarrollo local

### PostgreSQL

```bash
docker compose up -d postgres
```

### Backend

```bash
cd backend
dotnet restore DyxerSignature.slnx
dotnet run --project src/DyxerSignature.Api/DyxerSignature.Api.csproj
```

En Development se crea el esquema automáticamente para este PoC. Antes de staging se reemplazará por migraciones EF Core.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Blockchain

Por defecto Development usa un gateway simulado. Para probar realmente con Anvil:

```bash
anvil

cd backend/blockchain
forge create src/DocumentAnchor.sol:DocumentAnchor \
  --rpc-url http://127.0.0.1:8545 \
  --private-key <ANVIL_PRIVATE_KEY>
```

Luego configurar las variables descritas en `backend/.env.example`.

## Regla de dominio principal

Un contrato lógico puede tener N versiones documentales firmadas. Cada versión firmada es inmutable y mantiene su PDF, SHA-256, evidencia, auditoría y anclaje Polygon. Solo una versión por contrato puede estar vigente.

Documentación principal: `docs/architecture/ARCHITECTURE.md`.

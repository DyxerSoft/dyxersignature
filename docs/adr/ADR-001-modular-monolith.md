# ADR-001 — Monolito modular

**Estado:** Accepted

## Decisión

DyxerSignature se implementará inicialmente como un monolito modular con React en `frontend/` y ASP.NET Core en `backend/`.

El backend será un único artefacto desplegable y una única base PostgreSQL. Los límites Contracts, Documents, Signatures, Evidence, Blockchain y Audit se mantendrán como módulos internos.

## Motivo

El volumen inicial y la complejidad de negocio no justifican microservicios. El monolito reduce complejidad operacional, transacciones distribuidas y observabilidad fragmentada, sin renunciar a límites de dominio que permitan extraer módulos en el futuro si existe evidencia de necesidad.

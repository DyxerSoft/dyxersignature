# ADR-002 — Versionado e inmutabilidad documental

**Estado:** Accepted

## Contexto

El proceso real puede generar múltiples documentos firmados para un mismo contrato lógico debido a correcciones posteriores solicitadas por ventas.

## Decisión

Cada documento que complete la firma constituye una versión documental independiente e inmutable.

- Una corrección crea una nueva versión.
- Una versión previa nunca se sobrescribe ni elimina.
- Las versiones previas pasan a `SUPERSEDED`.
- Cada versión conserva PDF, SHA-256, Evidence Manifest, auditoría y Blockchain Anchor.
- Un contrato puede poseer múltiples versiones históricas pero solo una `ACTIVE`.
- La nueva versión solo reemplaza a la vigente cuando su anclaje blockchain esté confirmado.

## Consecuencia

Blockchain registra la existencia de todas las versiones firmadas, incluidas las que posteriormente dejan de ser oficiales. PostgreSQL conserva el estado de vigencia y la relación entre versiones.

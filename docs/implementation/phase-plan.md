# Plan de entrega del MVP

## Fases

1. Infraestructura y persistencia: Compose, PostgreSQL, migraciones, autenticación base, S3 privado, workflows, framework y evidencia.
2. Módulos de negocio: Dashboard, contratos, documentos, correcciones, versiones, firma, auditoría y endpoints.
3. Stellar y firmas: Outbox, integración real de Testnet, reintentos, idempotencia y verificación.
4. Integración frontend: conectar la interfaz existente y completar el recorrido de demo.
5. Carga y cierre: 100 usuarios, métrica global de 7–10 contratos/s, revisión de gates, guía y reporte final.

Cada cierre de fase debe anotar commit, archivos, pruebas ejecutadas y resultados verificables, bloqueos y siguiente fase. Un requisito que dependa de credenciales, servicio externo o ejecución no disponible permanece pendiente.

## Estado inicial

- Rama remota creada desde main: feat/stellar-hackathon-mvp.
- main y producción no se modifican.
- El checkout local no permite escribir .git; las ramas, commits y pushes se gestionan mediante la conexión GitHub autorizada.
- El entorno de trabajo no tiene Docker ni .NET SDK instalados. Se usarán builds remotos de GitHub Actions para validar el código cuando estén disponibles.

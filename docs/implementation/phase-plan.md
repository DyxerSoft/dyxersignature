# Plan de entrega del MVP

## Fases

1. Infraestructura y persistencia: Compose, PostgreSQL, migraciones, autenticación base, S3 privado, workflows, framework y evidencia.
2. Módulos de negocio: Dashboard, contratos, documentos, correcciones, versiones, firma, auditoría y endpoints.
3. Stellar y firmas: Outbox, integración real de Testnet, reintentos, idempotencia y verificación.
4. Integración frontend: conectar la interfaz existente y completar el recorrido de demo.
5. Carga y cierre: 100 usuarios, métrica global de 7–10 contratos/s, revisión de gates, guía y reporte final.

Cada cierre de fase debe anotar commit, archivos, pruebas ejecutadas y resultados verificables, bloqueos y siguiente fase. Un requisito que dependa de credenciales, servicio externo o ejecución no disponible permanece pendiente.

## Estado y evidencia al 22-11-2026

| Fase | Estado | Evidencia y límite pendiente |
|---|---|---|
| 1. Infraestructura y persistencia | Implementada y ejecutada en CI | Compose con PostgreSQL, SeaweedFS y API arrancó en los workflows efímeros; los volúmenes se limpiaron al terminar. |
| 2. Módulos de negocio | Implementada; build y pruebas backend pasan | Contratos, versiones inmutables, firma declarada, historial, auditoría, dashboard y descarga están conectados a PostgreSQL/API. |
| 3. Stellar y firmas | Flujo API→Outbox→Testnet demostrado | Run `45045085597` confirmó dos transacciones reales a través del worker, verificó el PDF descargado y probó el Dashboard; hashes y ledgers constan en `phase-03.md`. |
| 4. Integración frontend | Build e integración completados | CI frontend pasa y la API conecta dashboard y mesa de trabajo; no se hizo prueba manual de navegador en este entorno. |
| 5. Carga y cierre | Completada en CI | Run `45042238308`: 100 VUs, 173,873 recorridos/s, p95 840 ms y cero errores. Run `45045085597` completó dos anclas Stellar mediante el Outbox, descarga y Dashboard; Backend CI `45045085592` pasó Restore, Build, Tests y Docker. |

El arnés está integrado y conserva evidencia de análisis, pero `MVP-001` sigue en `ANALYZING`: el contrato de orquestación exige enlazar un `SESSION_ID` nativo antes de que el organizador entregue el resultado, y la interfaz de colaboración disponible solo expone nombre de tarea y salida. No se falsificó ese recibo ni se editaron estados/gates para declarar el ciclo cerrado.

El frontend pasó build CI y está conectado a las APIs; la ejecución del recorrido fue automatizada por API/Compose. No se observó manualmente la interacción en un navegador real en este entorno. No se modificaron `main` ni producción.

## Estado inicial

- Rama remota creada desde main: feat/stellar-hackathon-mvp.
- main y producción no se modifican.
- El checkout local no permite escribir .git; las ramas, commits y pushes se gestionan mediante la conexión GitHub autorizada.
- El entorno de trabajo no tiene Docker ni .NET SDK instalados. Se usarán builds remotos de GitHub Actions para validar el código cuando estén disponibles.


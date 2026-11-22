# Fase 5 — Carga, integración Testnet y cierre

## Resultado

La carga reproducible pasó con 100 usuarios virtuales. Compose ejecutó PostgreSQL, SeaweedFS, API y el generador k6 en un runner efímero de GitHub Actions. El flujo medido cubrió creación, carga de PDF sintético, revisión SHA-256, firma y Outbox, verificación de bytes y descarga privada autorizada.

| Métrica | Resultado |
|---|---:|
| Usuarios virtuales | 100 |
| Ventana solicitada / medida | 60 s / 60,31 s |
| Flujos completos | 10.486 |
| Throughput API + almacenamiento + Outbox | 173,873 flujos/s |
| p95 del flujo completo | 840 ms |
| Fallos / errores HTTP | 0 / 0 |
| Descargas S3 | HTTP 200, sin errores de etapa |

La meta de 7–10 flujos por segundo se superó en el runner. Esta prueba no espera una confirmación Stellar por iteración: demuestra que la API puede aceptar firmas y encolarlas sin bloquear la respuesta.

Evidencia: workflow run [`45042238308`](https://github.com/DyxerSoft/dyxersignature/actions/runs/45042238308), commit `5f2cea9db61fc53297ebae874ee2d7c6c9c081cb`. El artefacto `14761409098` contiene el resumen (3.780 bytes, SHA-256 `c84aad24ab09b18ac6181202551c434767cf41692ca21cd5fb9ec7c45b387bfa`). La máquina usada fue `ubuntu-24.04`; no representa el hardware de producción.

## Prueba API→Outbox→Stellar

El workflow [`stellar-testnet-e2e.yml`](../../../.github/workflows/stellar-testnet-e2e.yml) terminó correctamente en run [`45045085597`](https://github.com/DyxerSoft/dyxersignature/actions/runs/45045085597), sobre el commit `3714c8d01447b8338a1c824bfee114834f0d8ed2`. Creó y corrigió un contrato de prueba, confirmó ambas versiones en Stellar Testnet a través del worker, conservó la versión anterior como supersedida, verificó el contenido almacenado, descargó el PDF autorizado y comprobó las métricas del Dashboard.

- Versión 1: ledger `5868406`, transacción `6073bafe7cf27c9c07fe4f6d12b6373d39d9c1b56154cec97a8cb18c299f1dda` ([Horizon](https://horizon-testnet.stellar.org/transactions/6073bafe7cf27c9c07fe4f6d12b6373d39d9c1b56154cec97a8cb18c299f1dda)).
- Versión 2: SHA-256 `56ce7ad25d2f680ef95fdb0d37162f9db6b13c96c4d55e8ebd0768ac60128a43`, ledger `5868407`, transacción `a0a1c93266bf475568a1e93460bfc69276036a1b9b5903e2d7374dacf3fb148c` ([Horizon](https://horizon-testnet.stellar.org/transactions/a0a1c93266bf475568a1e93460bfc69276036a1b9b5903e2d7374dacf3fb148c)).
- API Stellar y hash del objeto: verificados. Descarga prefirmada: HTTP 200, 60 bytes, hash coincidente.
- Dashboard desde la base vacía del job: 1 contrato, 2 firmas, promedio 2,00 firmas por contrato, 0 anclajes pendientes.
- El job generó una cuenta Testnet temporal y credenciales locales aleatorias. El seed se enmascaró y no se guardó en el repositorio. Los datos de firmante y PDF fueron sintéticos; la cadena solo recibió hashes SHA-256.

La muestra separada de tres envíos secuenciales reales (run `45037850998`) observó 0,214 transacciones verificadas por segundo en 14.040 ms. Es una medición pequeña de latencia/throughput secuencial, no la capacidad máxima de Stellar. El throughput de confirmación on-chain no se debe confundir con los 173,873 flujos API por segundo.

## Defectos encontrados y correcciones

- Run `45043765178`: el endpoint Dashboard respondió HTTP 500 al calcular firmas del mes actual. Los logs de `45044832758` identificaron una expresión LINQ no traducible por EF Core; `3714c8d` calcula el límite mensual fuera de la expresión SQL.
- Run `45044204534`: la activación de una corrección violó el índice parcial `uq_one_active_version_per_contract` por el orden de las escrituras. `ae82e99be7fe46c2bd50034cf9ecea40252af8cb` supersede primero la versión anterior dentro de la misma transacción.
- Los fallos de descarga anteriores localizaron que la URL prefirmada conservaba HTTPS frente al endpoint HTTP de SeaweedFS. `5f2cea9` usa el esquema configurado; la carga final descargó correctamente.

## Archivos modificados en el cierre

- API y Outbox: `DashboardController.cs`, `BlockchainOutboxWorker.cs`.
- Smoke e2e: `backend/tools/StellarTestnetSmoke/Program.cs`, `.github/workflows/stellar-testnet-e2e.yml`.
- Evidencia: `phase-03.md`, `phase-04.md`, este reporte, `phase-plan.md`, `load-test.md`, `demo-guide.md`.

## Pruebas y resultados

- Backend CI `45045085592`: Restore, Build, Tests y Docker image build pasaron.
- E2E Compose/Testnet `45045085597`: pasó; pruebas reales de dos transacciones y descarga, con estado del Dashboard validado.
- Carga k6 `45042238308`: 100 VUs, 60 s, 173,873 flujos/s, p95 840 ms, 0 fallos.
- Frontend CI `45036964906`: instalación, TypeScript/Vite build e imagen Docker pasaron.
- El validador del harness pasó estructuralmente; conserva el estado `ANALYZING`. El workflow YAML nuevo también pasó el parseo local.
- Este equipo no tiene .NET SDK ni Docker; los builds y los recorridos de contenedores se ejecutaron en CI.

## Límites y gates pendientes

- El throughput medido corresponde al runner de CI con archivos sintéticos pequeños. Falta una carga en la infraestructura objetivo.
- La capacidad máxima de Stellar Testnet no quedó medida; la muestra secuencial fue 0,214 tx/s. La API sí devuelve sin esperar el ledger y deja el envío al Outbox.
- El frontend conserva el mockup y pasa build, pero no se completó una prueba manual de interacción en navegador en este entorno.
- Una ejecución de carga temprana (`45037629540`) dejó valores aleatorios temporales de Compose visibles en los logs antes de añadir máscaras. Compose no llegó a iniciar y no se usaron credenciales de producción; los workflows posteriores enmascaran los valores. La conexión GitHub disponible aquí permite leer, pero no borrar esos logs: el propietario puede eliminar esa ejecución o dejar que expire su retención.
- `MVP-001` permanece en `ANALYZING` en el harness: el protocolo gestionado requiere enlazar `SESSION_ID` nativo y la herramienta de colaboración disponible solo entrega nombre de tarea y resultado. No se falsificó el recibo ni se alteró el gate.
- La firma del MVP es una declaración autenticada y auditada, no una firma cualificada ni una validación de identidad externa.

## Siguiente fase

La implementación y validación funcional del MVP quedan registradas en la rama de feature. Antes de una evaluación de despliegue, medir en hardware objetivo, ejecutar el flujo manual del navegador con cuentas autorizadas y resolver el enlace de sesión requerido por el harness. No se desplegó ni se modificó `main` o producción.


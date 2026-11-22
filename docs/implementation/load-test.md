# Prueba de carga del MVP

## Ejecución reproducible

La acción `MVP load test` levanta PostgreSQL, SeaweedFS, API y frontend con Docker Compose en un runner `ubuntu-24.04`, genera credenciales efímeras y ejecuta k6 `0.54.0`. Para ejecutar el perfil de aceptación, usa `workflow_dispatch` con **100 VUs** y **60s**. Un push a `feat/stellar-hackathon-mvp` con `[load-test]` en el mensaje ejecuta los mismos valores predeterminados.

Los volúmenes y contenedores del runner se eliminan al terminar. El artefacto de cada ejecución contiene el resumen del escenario, el resumen crudo k6, versiones de Docker/Compose y las imágenes observadas; la retención del artefacto es de 30 días.

## Carga y métricas

Cada iteración crea un contrato, carga un PDF sintético pequeño en SeaweedFS, confirma el SHA-256, registra firmante, evidencia y mensaje Outbox, verifica los bytes almacenados, obtiene una URL autorizada y descarga el PDF privado. El contador de throughput se incrementa cuando termina todo este recorrido; la API debe aceptar el evento de firma (`202`) sin esperar a Stellar.

Se guardan contratos por segundo, éxito/error, p95 de la iteración completa y tasa de errores HTTP. La prueba exige al menos 7 flujos completos por segundo con 100 VUs; también informa resultados superiores a 10/s sin tratarlos como fallo. El contenido de prueba y las identidades son sintéticos.

La carga no abre 100 transacciones Stellar ni simula confirmaciones. La capacidad observada del ledger se mide aparte con tres envíos secuenciales reales de Testnet, verificados por transaction hash. Esa muestra reporta latencia y transacciones verificadas por segundo, y no pretende saturar ni estimar el máximo de la red.

## Límites

La métrica de negocio cubre contrato → almacenamiento S3 → revisión → firma declarada → enqueue durable → verificación de bytes → descarga autorizada. Stellar no tiene credenciales en este workload, así que el hash del archivo se verifica mientras el anclaje está pendiente; la confirmación de Testnet se mide en el smoke acotado aparte. Los resultados de CI son capacidad del runner configurado y no sustituyen una prueba de carga en el hardware objetivo de despliegue.


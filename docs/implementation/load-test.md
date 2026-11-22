# Prueba de carga del MVP

## Ejecución reproducible

La acción `MVP load test` levanta PostgreSQL, SeaweedFS, API y frontend con Docker Compose en un runner `ubuntu-24.04`, genera credenciales efímeras y ejecuta k6 `0.54.0`. Para ejecutar el perfil de aceptación, usa `workflow_dispatch` con **100 VUs** y **60s**. Un push a `feat/stellar-hackathon-mvp` con `[load-test]` en el mensaje ejecuta los mismos valores predeterminados.

En CI, k6 comparte la red del contenedor API y las URLs prefirmadas usan el DNS interno `seaweedfs:8333`, de modo que el runner verifica el mismo endpoint S3 privado sin depender de `localhost` entre contenedores. La configuración de desarrollo para descargas desde el navegador conserva `http://localhost:8333`.

Los volúmenes y contenedores del runner se eliminan al terminar. El artefacto de cada ejecución contiene el resumen del escenario, el resumen crudo k6, versiones de Docker/Compose y las imágenes observadas; la retención del artefacto es de 30 días.

## Carga y métricas

Cada iteración crea un contrato, carga un PDF sintético pequeño en SeaweedFS, confirma el SHA-256, registra firmante, evidencia y mensaje Outbox, verifica los bytes almacenados, obtiene una URL autorizada y descarga el PDF privado. El contador de throughput se incrementa cuando termina todo este recorrido; la API debe aceptar el evento de firma (`202`) sin esperar a Stellar.

Se guardan contratos por segundo, éxito/error, p95 de la iteración completa y tasa de errores HTTP. La prueba exige al menos 7 flujos completos por segundo con 100 VUs; también informa resultados superiores a 10/s sin tratarlos como fallo. El contenido de prueba y las identidades son sintéticos.

La carga no abre 100 transacciones Stellar ni simula confirmaciones. La capacidad observada del ledger se mide aparte con tres envíos secuenciales reales de Testnet, verificados por transaction hash. Esa muestra reporta latencia y transacciones verificadas por segundo, y no pretende saturar ni estimar el máximo de la red.

## Resultado registrado

- Workflow run `45042238308`, commit `5f2cea9db61fc53297ebae874ee2d7c6c9c081cb`, runner `ubuntu-24.04`.
- 100 VUs durante 60 s; ventana medida de 60,31 s.
- 10.486 recorridos completos, 0 fallidos; throughput completado de 173,873 flujos/s (un contrato por iteración).
- p95 del recorrido completo: 840 ms; tasa de errores HTTP: 0; descarga S3: HTTP 200, sin fallos de etapa.
- El gate mínimo de 7/s se cumplió en el runner. El artefacto `14761409098` (3.780 bytes, SHA-256 `c84aad24ab09b18ac6181202551c434767cf41692ca21cd5fb9ec7c45b387bfa`) conserva el resumen generado.
- El flujo usó PDFs pequeños y sintéticos. No incluyó confirmaciones Stellar; la carga corresponde al runner efímero de Actions y no demuestra la capacidad del hardware de producción.

El smoke API→Outbox→Testnet separado confirmó dos versiones consecutivas de un contrato, preservó la primera, verificó ambas transacciones y descargó la segunda: [run `45045085597`](https://github.com/DyxerSoft/dyxersignature/actions/runs/45045085597). En el mismo run el Dashboard informó 1 contrato, 2 firmas, 2,00 firmas por contrato y 0 anclajes pendientes. Sus transacciones sirven de prueba funcional, no como medición máxima de capacidad de Stellar.

## Límites

La métrica de negocio cubre contrato → almacenamiento S3 → revisión → firma declarada → enqueue durable → verificación de bytes → descarga autorizada. Stellar no tiene credenciales en este workload, así que el hash del archivo se verifica mientras el anclaje está pendiente; la confirmación de Testnet se mide en el smoke acotado aparte. Los resultados de CI son capacidad del runner configurado y no sustituyen una prueba de carga en el hardware objetivo de despliegue.


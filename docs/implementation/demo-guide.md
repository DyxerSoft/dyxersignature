# Guía de demostración

## Requisitos

- Docker Engine y Docker Compose.
- Node.js 24 y npm solo si se ejecuta el frontend fuera de Compose.
- Un PDF de prueba cuyo uso esté autorizado.
- Para confirmar anclajes reales del recorrido: una cuenta financiada en Stellar Testnet y sus valores de clave configurados fuera del repositorio.

## Preparación y arranque

1. Copia `.env.example` a `.env`.
2. Reemplaza las contraseñas de ejemplo por valores locales aleatorios. `AUTH_JWT_SIGNING_KEY` debe tener al menos 32 bytes. Nunca subas `.env` ni una semilla a Git.
3. Para la demostración con blockchain, configura `STELLAR_PUBLIC_KEY` y `STELLAR_SECRET_SEED` en `.env` desde la cuenta Testnet elegida. Esta configuración no se requiere para iniciar el stack; sin ella los mensajes del Outbox permanecen pendientes/reintentando.
4. Ejecuta `docker compose up --build` y espera a que Postgres, SeaweedFS y la API estén disponibles.
5. Abre `http://localhost:3000`. API Swagger: `http://localhost:8080/swagger`.

El frontend solicita un token de demostración en `/api/v1/auth/dev-token`. El endpoint solo existe cuando ASP.NET Core está en entorno `Development`, como configura el Compose local. No publicar este perfil ni esta autenticación en producción.

## Recorrido

1. En Dashboard, confirma que las métricas iniciales provienen de la base persistida.
2. Crea un contrato con una referencia de prueba.
3. Carga un PDF. La API calcula SHA-256 y guarda el objeto privado en SeaweedFS; se crea una nueva versión inmutable.
4. Descarga o revisa el PDF y pulsa **Confirmar revisión**. El servidor verifica que el hash coincide con los bytes recibidos.
5. Completa nombre y correo del firmante y pulsa **Firmar y anclar**. Se registra el firmante, la evidencia y un mensaje idempotente del Outbox en una transacción de PostgreSQL.
6. Espera la confirmación asíncrona de Stellar. El detalle muestra estado, transaction hash y ledger.
7. Pulsa **Verificar integridad**. La API recalcula el hash del objeto privado y valida que la transacción exitosa de Stellar contiene el mismo hash.
8. Pulsa **Descargar PDF** para obtener una URL prefirmada temporal emitida tras autorización y auditoría.
9. Para corregir el documento, carga otro PDF con motivo. El historial conserva ambas versiones; no se reemplaza ni elimina el objeto anterior.

## Endpoints principales

| Acción | Endpoint |
|---|---|
| Métricas del dashboard | `GET /api/v1/dashboard` |
| Crear/listar contratos | `POST /api/v1/contracts`, `GET /api/v1/contracts` |
| Ver contrato, versiones y firmantes | `GET /api/v1/contracts/{id}` |
| Cargar versión/corrección | `POST /api/v1/contracts/{id}/versions` (multipart PDF) |
| Revisar hash | `POST /api/v1/contracts/{id}/versions/{versionId}/review` |
| Firmar y encolar Stellar | `POST /api/v1/contracts/{id}/versions/{versionId}/sign` |
| Comparar versiones | `GET /api/v1/contracts/{id}/documents/compare?fromVersion=1&toVersion=2` |
| Verificar archivo y blockchain | `GET /api/v1/contracts/{id}/versions/{versionId}/verify` |
| Emitir enlace de descarga temporal | `GET /api/v1/documents/{versionId}/download` |
| Firmantes | `GET /api/v1/contracts/{id}/signatures` |
| Auditoría | `GET /api/v1/contracts/{id}/audit` |

Las rutas de negocio requieren JWT. La descarga retorna la URL breve después de validar autorización; el bucket mantiene los objetos privados.

## Smoke test aislado de Stellar

`dotnet run --project backend/tools/StellarTestnetSmoke/StellarTestnetSmoke.csproj` genera una clave efímera en memoria, solicita fondos a Friendbot Testnet y ancla/verifica tres hashes aleatorios de forma secuencial mediante el SDK usado por la API. Registra latencia por muestra y transacciones verificadas por segundo; la semilla no se imprime ni se persiste. En GitHub Actions el smoke test corre solo cuando el commit contiene `[stellar-smoke]` o por ejecución manual.

Este smoke test mide una muestra pequeña del adaptador contra Testnet, no el límite máximo de la red. El recorrido completo con PDF ya está cubierto por el workflow API→Outbox→Testnet descrito abajo.

## Smoke test API→Outbox→Testnet

El workflow [Stellar Testnet API end-to-end](../../.github/workflows/stellar-testnet-e2e.yml) levanta PostgreSQL, SeaweedFS y la API en Compose, crea una cuenta efímera financiada por Friendbot y prueba crear contrato → cargar y corregir dos PDFs sintéticos → revisar → declarar ambas firmas → esperar el Outbox → verificar hashes en Stellar → emitir URL autorizada → descargar y volver a calcular SHA-256. Run `45045085597` completó el recorrido, verificó ambas anclas y la descarga, y obtuvo métricas del Dashboard de 1 contrato, 2 firmas, promedio 2,00 firmas por contrato y 0 anclajes pendientes. La semilla solo existe en el runner efímero y se enmascara; no se guarda en Git ni se envían datos personales a la red.

El workflow se inicia manualmente o con un push a `feat/stellar-hackathon-mvp` cuyo mensaje incluya `[stellar-e2e]`. Cada ejecución crea un stack y credenciales efímeros, y elimina sus volúmenes al finalizar. Las transacciones y el resultado de verificación se conservan en los logs de Actions; el estado del dashboard se comprueba con una base vacía de ese job.

## Limitaciones de la demo

- La acción de firmar registra una declaración del firmante; no es una firma criptográfica cualificada ni una validación de identidad.
- La comparación muestra metadatos y cambio de SHA-256; no calcula diferencias visuales entre páginas PDF.
- El recorrido API completo y la carga están verificados en runners efímeros de GitHub Actions; la interfaz React está conectada y pasa build, pero no se hizo una sesión manual del flujo en un navegador real en este entorno.


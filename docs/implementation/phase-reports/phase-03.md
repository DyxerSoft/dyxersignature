# Fase 3 — Stellar Testnet, firma declarada y outbox

## Entrega

Se sustituyó la implementación Polygon simulada por un adaptador restringido a Stellar Testnet y al Horizon HTTPS oficial. El anclaje conserva en Stellar solamente el SHA-256 hexadecimal bajo la clave de datos `dyxersignature.hash`; el backend guarda la red, el transaction hash, el ledger, el estado y los reintentos.

El worker procesa una outbox PostgreSQL con `FOR UPDATE SKIP LOCKED`, leases con token, persistencia del XDR firmado antes del envío, reintento del mismo envelope y recuperación por transaction hash. La API no espera al ledger: firma y creación de anclaje se registran primero y el worker procesa en segundo plano. La verificación consulta la operación Manage Data asociada al transaction hash.

La firma sigue siendo una declaración autenticada de un firmante que entrega un PDF definitivo; no se genera un certificado de firma criptográfica ni se valida identidad externa. El outbox y el estado del anclaje sí quedan persistidos y son trazables.

## Commits

- `52e6b4153a52d8340025cf178a16577339f669eb` — adaptador Stellar y outbox durable.
- `3c3a9d2b542986ee1414a8dce294bba47c927c00` — restore del proyecto de pruebas en la imagen Docker.
- `fa0975a5af29cf982f97351e998f63ca92835942` — smoke test de Testnet.
- `6d7c5a35afc147aca8d505d69b1c089e1fb88df4` — resultado de error Horizon visible en logs.
- `979a23d228e0fb6b7b0570611d396c6970420743` — elimina el límite inferior de tiempo que causaba `tx_too_early` por desfase de reloj.

## Evidencia y pruebas

- Stellar Testnet smoke run `45034897292`: pasó; una transacción real fue verificada en ledger `5867071`.
- Transaction hash: `c3face26a35ba4aaa2b72378e7672a410722941f762556ca053a2916c1b249b3`.
- SHA-256 confirmado en esa transacción: `8fb1c902efca9f58d9af02db256404686d3132f6592c15e7328a4bb56d7eb3fa`.
- [Transacción en Stellar Horizon Testnet](https://horizon-testnet.stellar.org/transactions/c3face26a35ba4aaa2b72378e7672a410722941f762556ca053a2916c1b249b3).
- Backend CI `45034897263`: Restore, Build, pruebas .NET y Docker image build pasaron.
- No se imprimió ni versionó el seed de cuenta. El smoke creó y financió una cuenta efímera de Testnet.

## Bloqueos y límites

- La evidencia verifica el adapter directamente en Testnet, pero aún no demuestra el flujo completo PDF→API→SeaweedFS→Outbox→Stellar→descarga en un runtime Compose.
- El valor único de esta muestra no mide capacidad ni throughput representativo de Stellar; se ejecutará una prueba externa acotada y secuencial en la fase 5.
- La configuración de una cuenta de producto usa secretos externos. El smoke autónomo de CI emplea una cuenta temporal y no verifica una integración de identidad real.

## Siguiente fase

Conectar el frontend existente a los endpoints y cerrar la guía de demostración; mantener el flujo runtime como gate pendiente hasta poder ejecutar Compose.


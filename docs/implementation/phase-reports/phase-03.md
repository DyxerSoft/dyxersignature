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

## Evidencia de integración añadida en el cierre

El workflow API→Outbox→Testnet `45043650143` probó el worker con Compose, SeaweedFS y PostgreSQL en ejecución: creó un contrato, firmó dos versiones, preservó la anterior, verificó el PDF corregido y descargó 60 bytes con HTTP 200. Ambas anclas reales fueron verificadas por la API:

- Versión 1, ledger `5868219`, transaction hash `f8249216d62916e4df3934da338e8879ab2e1b1658284d57be6a9f69a0ca70e4` ([Horizon](https://horizon-testnet.stellar.org/transactions/f8249216d62916e4df3934da338e8879ab2e1b1658284d57be6a9f69a0ca70e4)).
- Versión 2, SHA-256 `56ce7ad25d2f680ef95fdb0d37162f9db6b13c96c4d55e8ebd0768ac60128a43`, ledger `5868220`, transaction hash `274c9625a1b39ab00bb0b5f2977405daba04f754336ef73b28af85f85c4b60fa` ([Horizon](https://horizon-testnet.stellar.org/transactions/274c9625a1b39ab00bb0b5f2977405daba04f754336ef73b28af85f85c4b60fa)).

## Repetición final

El run `45045085597`, sobre el commit `3714c8d01447b8338a1c824bfee114834f0d8ed2`, terminó correctamente después de dos correcciones de runtime:

- Versiones 1 y 2 conservaron el historial; el Dashboard devolvió 1 contrato, 2 firmas, promedio de 2,00 firmas por contrato y 0 anclajes pendientes.
- Versión 1: ledger `5868406`, hash `6073bafe7cf27c9c07fe4f6d12b6373d39d9c1b56154cec97a8cb18c299f1dda` ([Horizon](https://horizon-testnet.stellar.org/transactions/6073bafe7cf27c9c07fe4f6d12b6373d39d9c1b56154cec97a8cb18c299f1dda)).
- Versión 2: SHA-256 `56ce7ad25d2f680ef95fdb0d37162f9db6b13c96c4d55e8ebd0768ac60128a43`, ledger `5868407`, hash `a0a1c93266bf475568a1e93460bfc69276036a1b9b5903e2d7374dacf3fb148c` ([Horizon](https://horizon-testnet.stellar.org/transactions/a0a1c93266bf475568a1e93460bfc69276036a1b9b5903e2d7374dacf3fb148c)).
- Verificación API de Stellar y del objeto S3: `true`; descarga autorizada: HTTP 200, 60 bytes, SHA-256 coincidente.
- Backend CI `45045085592`: Restore, Build, Tests y Docker image build correctos.

## Bloqueos y límites

- Las fallas `45043765178`, `45044204534` y `45044832758` identificaron dos defectos: el orden de las actualizaciones frente al índice único parcial y la expresión LINQ no traducible de la métrica mensual. Los commits `ae82e99` y `3714c8d` los corrigieron; `45045085597` pasó end-to-end.
- El smoke secuencial de tres transacciones `45037850998` midió 0,214 transacciones verificadas por segundo (14.040 ms total). Es una muestra acotada, no la capacidad máxima de Stellar.
- La configuración de una cuenta de producto usa secretos externos. El smoke autónomo de CI emplea una cuenta temporal y no verifica una integración de identidad real.

## Siguiente fase

Fase 3 cerrada con evidencia real de Testnet. La fase 5 registra por separado el rendimiento HTTP y la muestra limitada de capacidad Stellar.


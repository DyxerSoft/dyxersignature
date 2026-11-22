# Stellar Testnet document anchors

The API anchors the lowercase SHA-256 hex digest of a finalized document in the `dyxersignature.hash` account-data entry. The on-chain value contains no PDF, contract identifier, signer information, email address, or other personal data. Each finalized version has an immutable database anchor record; Stellar transaction history provides the verifiable record for prior values of the reusable account-data entry.

## Configuration

Set `STELLAR_PUBLIC_KEY` and `STELLAR_SECRET_SEED` through a secret manager or an untracked local `.env` file. Never commit a real secret seed. The API accepts only `Network=Testnet` and the official HTTPS endpoint `https://horizon-testnet.stellar.org`. An unset seed leaves API requests available while the asynchronous outbox retries anchor submissions; configure a funded Testnet account to complete the demo flow.

## Submission lifecycle

1. Signing persists the immutable signature event, evidence manifest, anchor, and idempotent outbox message in one PostgreSQL transaction.
2. A worker claims due messages with a short `FOR UPDATE SKIP LOCKED` lease.
3. It signs a Stellar transaction and stores its transaction hash and signed envelope before network submission.
4. Retries submit the exact saved envelope. A lost response is reconciled against the transaction hash and its Manage Data operation before another attempt.
5. Confirmation is written to PostgreSQL and activates the version only if a newer version has not already been created.

The API does not wait for Stellar. Check `GET /api/v1/contracts/{id}` for the anchor status and transaction hash, then verify a stored version with `GET /api/v1/contracts/{contractId}/versions/{versionId}/verify`.

## Testnet verification

The backend performs a server-side lookup by the persisted Stellar transaction hash and confirms that the successful transaction contains the expected `dyxersignature.hash` Manage Data operation. A transaction hash alone is not shown as a verified anchor. The adapter-level transaction is proven by the smoke workflow; full Compose evidence for a real uploaded document remains pending until the containers are run together.

To perform an isolated adapter smoke test without committing or configuring any seed, run `dotnet run --project backend/tools/StellarTestnetSmoke/StellarTestnetSmoke.csproj`. It generates a temporary keypair in memory, funds the new account through Testnet Friendbot, anchors a random SHA-256 value, and verifies the resulting transaction. The GitHub workflow runs this smoke test only for a push whose commit message contains `[stellar-smoke]` or a manual workflow dispatch. The generated seed is never printed, persisted, or sent to Mainnet.

Latest observed smoke evidence: workflow run `45034897292` passed on 2026-11-22. Transaction `c3face26a35ba4aaa2b72378e7672a410722941f762556ca053a2916c1b249b3` was included in ledger `5867071` and verified against SHA-256 `8fb1c902efca9f58d9af02db256404686d3132f6592c15e7328a4bb56d7eb3fa`. [View the Testnet transaction](https://horizon-testnet.stellar.org/transactions/c3face26a35ba4aaa2b72378e7672a410722941f762556ca053a2916c1b249b3).


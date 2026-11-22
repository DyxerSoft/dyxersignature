# Security policy

## Data and secrets

- Never commit credentials, Stellar secret seeds, JWT signing keys, S3 keys, or production connection strings.
- Read signing and storage credentials from an external secret store or process environment.
- Keep contract PDFs in the private SeaweedFS S3 bucket. Do not place file bytes, signer identity, business references, or URLs in Stellar transactions.
- Store only the definitive document SHA-256 and a key derived from that hash on Stellar Testnet.

## Access and retention

- Require bearer authentication for contract, signature, audit, verification, and download endpoints.
- Keep audit events, signature events, definitive versions, and object storage append-only.
- Delete a contract logically and retain its versions and evidence for audit.
- Authorize each download before issuing a short-lived presigned URL.

## Reporting

Record findings with affected path, evidence, impact, and remediation in the MVP-001 security artifacts. Do not mark the security gate complete while evidence is missing.

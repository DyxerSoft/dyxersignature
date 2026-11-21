# Blockchain

Foundry project for the Polygon anchor contract.

MVP rule: one immutable anchor per SHA-256 document hash. The smart contract does **not** store PII, PDFs, business contract IDs or the ACTIVE/SUPERSEDED state.

## Local Anvil

```bash
anvil
```

In another terminal:

```bash
forge create src/DocumentAnchor.sol:DocumentAnchor \
  --rpc-url http://127.0.0.1:8545 \
  --private-key <ANVIL_PRIVATE_KEY>
```

Configure the returned contract address and the same Anvil account in the backend via environment variables/user-secrets.

Target environments:

- local: Anvil;
- QA: Polygon Amoy;
- production: Polygon PoS after security review.

The production signer must use KMS/HSM/secure signer; never commit private keys or production mnemonics.

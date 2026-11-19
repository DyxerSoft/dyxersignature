# Blockchain

Foundry project for the Polygon anchor contract.

MVP rule: one immutable anchor per SHA-256 document hash. The smart contract does **not** store PII, PDFs, business contract IDs or the ACTIVE/SUPERSEDED state.

Target environments:

- local: Anvil;
- QA: Polygon Amoy;
- production: Polygon PoS after security review.

The production signer must use KMS/HSM/secure signer; never commit private keys or production mnemonics.

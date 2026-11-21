import { FormEvent, useEffect, useState } from "react";
import { createContract, getContract, uploadSignedVersion } from "./api";
import type { ContractDetail } from "./types";

export function ContractWorkbench() {
  const [businessReference, setBusinessReference] = useState("GP-TEST-0001");
  const [contractId, setContractId] = useState("");
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh(id = contractId) {
    if (!id) return;
    const data = await getContract(id);
    setContract(data);
  }

  useEffect(() => {
    if (!contractId) return;

    const timer = window.setInterval(() => {
      void refresh(contractId);
    }, 2500);

    return () => window.clearInterval(timer);
  }, [contractId]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const created = await createContract(businessReference);
      setContractId(created.id);
      await refresh(created.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear el contrato.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!file || !contractId) return;

    setBusy(true);
    setError("");

    try {
      await uploadSignedVersion(contractId, file, reason || undefined);
      setFile(null);
      setReason("");
      await refresh(contractId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar el documento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workbench" aria-labelledby="workbench-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">REQ-DYXS-001</span>
          <h2 id="workbench-title">Prueba de versionado y blockchain</h2>
        </div>
        {contract && <span className="status-pill">{contract.status}</span>}
      </div>

      <form className="form-row" onSubmit={handleCreate}>
        <label>
          Referencia de negocio
          <input
            value={businessReference}
            onChange={(event) => setBusinessReference(event.target.value)}
            required
          />
        </label>
        <button disabled={busy} type="submit">Crear contrato</button>
      </form>

      {contractId && (
        <form className="form-row" onSubmit={handleUpload}>
          <label>
            PDF firmado de prueba
            <input
              accept="application/pdf,.pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              type="file"
              required
            />
          </label>
          <label>
            Motivo de corrección
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Solo para V2+"
            />
          </label>
          <button disabled={busy || !file} type="submit">Crear versión</button>
        </form>
      )}

      {error && <p className="error-message" role="alert">{error}</p>}

      {contract && (
        <>
          <div className="contract-summary">
            <div>
              <span>Contrato</span>
              <strong>{contract.businessReference}</strong>
            </div>
            <div>
              <span>ID</span>
              <code>{contract.id}</code>
            </div>
          </div>

          <div className="version-list">
            {contract.versions.map((version) => (
              <article className="version-card" key={version.id}>
                <div className="version-card__header">
                  <strong>V{version.versionNumber}</strong>
                  <span className="status-pill">{version.status}</span>
                </div>
                <dl>
                  <dt>SHA-256</dt>
                  <dd><code>{version.documentHash ?? "pendiente"}</code></dd>
                  <dt>Blockchain</dt>
                  <dd>{version.blockchain?.status ?? "pendiente"}</dd>
                  <dt>TX</dt>
                  <dd><code>{version.blockchain?.transactionHash ?? "—"}</code></dd>
                  <dt>Bloque</dt>
                  <dd>{version.blockchain?.blockNumber ?? "—"}</dd>
                  {version.correctionReason && (
                    <>
                      <dt>Sustituida por</dt>
                      <dd>{version.correctionReason}</dd>
                    </>
                  )}
                </dl>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

import { FormEvent, useEffect, useState } from "react";
import {
  compareVersions,
  createContract,
  getContract,
  getDownloadUrl,
  listContracts,
  listSigners,
  reviewVersion,
  signVersion,
  uploadDraftVersion,
  verifyVersion
} from "./api";
import type {
  ContractComparison,
  ContractDetail,
  ContractListItem,
  ContractVersion,
  DocumentVerification,
  Signer
} from "./types";

export function ContractWorkbench({ initialContractId = "" }: { initialContractId?: string } = {}) {
  const [businessReference, setBusinessReference] = useState("GP-TEST-0001");
  const [title, setTitle] = useState("Acuerdo de demostración");
  const [contractId, setContractId] = useState(initialContractId);
  const [contractList, setContractList] = useState<ContractListItem[]>([]);
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState("");
  const [signerName, setSignerName] = useState("Firmante de demostración");
  const [signerEmail, setSignerEmail] = useState("demo@dyxer.local");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [verification, setVerification] = useState<Record<string, DocumentVerification>>({});
  const [signers, setSigners] = useState<Signer[]>([]);
  const [fromVersion, setFromVersion] = useState("");
  const [toVersion, setToVersion] = useState("");
  const [comparison, setComparison] = useState<ContractComparison | null>(null);

  async function refreshContract(id = contractId) {
    if (!id) return;
    const data = await getContract(id);
    setContract(data);
  }

  async function refreshList() {
    const data = await listContracts();
    setContractList(data.items);
  }

  useEffect(() => {
    void refreshList().catch((cause) => setError(messageFrom(cause)));
  }, []);

  useEffect(() => {
    if (!contractId) return;
    void refreshContract(contractId).catch((cause) => setError(messageFrom(cause)));
    const timer = window.setInterval(() => {
      void refreshContract(contractId).catch((cause) => setError(messageFrom(cause)));
    }, 3000);
    return () => window.clearInterval(timer);
  }, [contractId]);

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(successMessage);
      await Promise.all([refreshContract(), refreshList()]);
      return true;
    } catch (cause) {
      setError(messageFrom(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const created = await createContract(businessReference, title);
      setContractId(created.id);
      setNotice("Contrato creado. Carga un PDF para crear su primera versión.");
      await refreshList();
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!file || !contractId) return;
    const saved = await runAction(
      () => uploadDraftVersion(contractId, file, reason.trim() || undefined),
      "Versión almacenada como borrador inmutable. Revisa el PDF y confirma su hash."
    );
    if (!saved) return;
    setFile(null);
    setReason("");
    const input = document.getElementById("contract-pdf") as HTMLInputElement | null;
    if (input) input.value = "";
  }

  async function handleCompare(event: FormEvent) {
    event.preventDefault();
    if (!contractId || !fromVersion || !toVersion) return;
    setBusy(true);
    setError("");
    try {
      setComparison(await compareVersions(contractId, Number(fromVersion), Number(toVersion)));
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  }

  async function showSigners() {
    if (!contractId) return;
    setBusy(true);
    setError("");
    try {
      setSigners((await listSigners(contractId)).signers);
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  }

  async function download(version: ContractVersion) {
    setBusy(true);
    setError("");
    try {
      const link = await getDownloadUrl(version.id);
      window.location.assign(link.downloadUrl);
    } catch (cause) {
      setError(messageFrom(cause));
      setBusy(false);
    }
  }

  async function verify(version: ContractVersion) {
    if (!contractId) return;
    setBusy(true);
    setError("");
    try {
      const result = await verifyVersion(contractId, version.id);
      setVerification((current) => ({ ...current, [version.id]: result }));
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workbench" aria-labelledby="workbench-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Contratos y documentos</span>
          <h2 id="workbench-title">Flujo de revisión y firma</h2>
          <p className="muted-copy">Cada corrección crea una versión nueva; los archivos anteriores se conservan.</p>
        </div>
        {contract && <span className="status-pill">{contract.status}</span>}
      </div>

      {error && <p className="error-message" role="alert">{error}</p>}
      {notice && <p className="success-message" role="status">{notice}</p>}

      <div className="contract-picker">
        <label>
          Abrir contrato
          <select value={contractId} onChange={(event) => setContractId(event.target.value)}>
            <option value="">Selecciona un contrato</option>
            {contractList.map((item) => (
              <option value={item.id} key={item.id}>
                {item.businessReference} · {item.title} · {item.status}
              </option>
            ))}
          </select>
        </label>
      </div>

      <form className="form-row contract-create-form" onSubmit={handleCreate}>
        <label>
          Referencia de negocio
          <input value={businessReference} onChange={(event) => setBusinessReference(event.target.value)} required />
        </label>
        <label>
          Título
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <button disabled={busy} type="submit">Crear contrato</button>
      </form>

      {contractId && (
        <>
          <form className="form-row upload-form" onSubmit={handleUpload}>
            <label>
              PDF de la versión
              <input
                id="contract-pdf"
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
                placeholder={contract?.versions.length ? "Obligatorio desde la segunda versión" : "Primera versión"}
                required={Boolean(contract?.versions.length)}
              />
            </label>
            <button disabled={busy || !file} type="submit">Guardar versión</button>
          </form>

          <div className="signer-form">
            <strong>Datos del firmante de demostración</strong>
            <div className="form-row">
              <label>
                Nombre
                <input value={signerName} onChange={(event) => setSignerName(event.target.value)} required />
              </label>
              <label>
                Correo
                <input type="email" value={signerEmail} onChange={(event) => setSignerEmail(event.target.value)} />
              </label>
            </div>
          </div>

          {contract && (
            <>
              <div className="contract-summary">
                <div><span>Contrato</span><strong>{contract.businessReference} · {contract.title}</strong></div>
                <div><span>ID</span><code>{contract.id}</code></div>
              </div>

              <div className="version-list">
                {contract.versions.map((version) => (
                  <article className="version-card" key={version.id}>
                    <div className="version-card__header">
                      <strong>Versión {version.versionNumber}</strong>
                      <span className="status-pill">{version.status}</span>
                    </div>
                    <dl>
                      <dt>SHA-256</dt>
                      <dd><code>{version.documentHash ?? "pendiente"}</code></dd>
                      <dt>Corrección</dt>
                      <dd>{version.correctionReason ?? "Versión inicial"}</dd>
                      <dt>Stellar</dt>
                      <dd>{version.blockchain?.status ?? "Aún no firmada"}</dd>
                      <dt>Red / ledger</dt>
                      <dd>{version.blockchain?.networkName ?? "—"} / {version.blockchain?.ledgerNumber ?? "—"}</dd>
                      <dt>Transaction hash</dt>
                      <dd><code>{version.blockchain?.transactionHash ?? "pendiente"}</code></dd>
                    </dl>
                    <div className="action-row">
                      {version.status === "Draft" && version.documentHash && (
                        <button disabled={busy} onClick={() => void runAction(
                          () => reviewVersion(contract.id, version.id, version.documentHash!),
                          "Revisión registrada para el hash mostrado."
                        )} type="button">Confirmar revisión</button>
                      )}
                      {version.status === "ClientAccepted" && version.documentHash && (
                        <button disabled={busy || !signerName.trim()} onClick={() => void runAction(
                          () => signVersion(
                            contract.id,
                            version.id,
                            version.documentHash!,
                            signerName,
                            signerEmail || undefined
                          ),
                          "Firma registrada. Stellar se procesa de forma asíncrona."
                        )} type="button">Firmar y anclar</button>
                      )}
                      {version.documentHash && (
                        <button className="button-secondary" disabled={busy} onClick={() => void download(version)} type="button">
                          Descargar PDF
                        </button>
                      )}
                      {version.signedAtUtc && (
                        <button className="button-secondary" disabled={busy} onClick={() => void verify(version)} type="button">
                          Verificar integridad
                        </button>
                      )}
                    </div>
                    {verification[version.id] && (
                      <p className={verification[version.id].verified ? "verification-ok" : "verification-failed"} role="status">
                        {verification[version.id].verified
                          ? "PDF y transacción Stellar verificados."
                          : `Verificación incompleta: archivo ${verification[version.id].contentMatches ? "correcto" : "no coincide"}; Stellar ${verification[version.id].blockchain.verified ? "confirmado" : "pendiente"}.`}
                      </p>
                    )}
                  </article>
                ))}
              </div>

              <div className="history-tools">
                <form className="compare-form" onSubmit={handleCompare}>
                  <strong>Comparar versiones</strong>
                  <label>
                    Desde
                    <select value={fromVersion} onChange={(event) => setFromVersion(event.target.value)} required>
                      <option value="">Versión</option>
                      {contract.versions.map((version) => <option key={version.id} value={version.versionNumber}>V{version.versionNumber}</option>)}
                    </select>
                  </label>
                  <label>
                    Hasta
                    <select value={toVersion} onChange={(event) => setToVersion(event.target.value)} required>
                      <option value="">Versión</option>
                      {contract.versions.map((version) => <option key={version.id} value={version.versionNumber}>V{version.versionNumber}</option>)}
                    </select>
                  </label>
                  <button className="button-secondary" disabled={busy || contract.versions.length < 2} type="submit">Comparar</button>
                </form>
                {comparison && (
                  <p className="comparison-result">
                    V{comparison.source.versionNumber} → V{comparison.target.versionNumber}: hash {comparison.hashChanged ? "distinto" : "igual"}. {comparison.comparison}
                  </p>
                )}
                <button className="button-secondary" disabled={busy} onClick={() => void showSigners()} type="button">
                  Ver histórico de firmantes
                </button>
                {signers.length > 0 && (
                  <ul className="signer-list">
                    {signers.map((signer) => (
                      <li key={signer.id}>V{contract.versions.find((version) => version.id === signer.documentVersionId)?.versionNumber ?? "?"}: {signer.signerName} · {new Date(signer.signedAtUtc).toLocaleString()}</li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function messageFrom(cause: unknown) {
  return cause instanceof Error ? cause.message : "La solicitud no se pudo completar.";
}


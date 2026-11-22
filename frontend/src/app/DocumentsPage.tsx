import { useEffect, useState } from "react";
import { getContract, getDownloadUrl, listContracts, verifyVersion } from "../features/stellar/api";
import type { ContractDetail, ContractListItem, DocumentVerification } from "../features/stellar/types";
import { Icon } from "./Icon";
import { PageFooter } from "./DashboardPage";

/** La API del MVP almacena documentos como versiones de contrato, no como plantillas independientes. */
export function DocumentsPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<ContractDetail | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [verifications, setVerifications] = useState<Record<string, DocumentVerification>>({});

  useEffect(() => {
    let live = true;
    void listContracts(1, 100).then(response => {
      if (!live) return;
      setContracts(response.items);
      if (response.items.length > 0) setSelectedId(response.items[0].id);
    }).catch((cause: unknown) => {
      if (live) setError(cause instanceof Error ? cause.message : "No se pudo obtener los contratos.");
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let live = true;
    setError("");
    setDetail(null);
    void getContract(selectedId).then(data => {
      if (live) setDetail(data);
    }).catch((cause: unknown) => {
      if (live) setError(cause instanceof Error ? cause.message : "No se pudieron consultar las versiones.");
    });
    return () => { live = false; };
  }, [selectedId]);

  async function download(versionId: string) {
    setActionError("");
    setBusy(true);
    try {
      const response = await getDownloadUrl(versionId);
      window.location.assign(response.downloadUrl);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "No se pudo obtener el enlace de descarga.");
      setBusy(false);
    }
  }

  async function verify(versionId: string) {
    if (!selectedId) return;
    setActionError("");
    setBusy(true);
    try {
      const result = await verifyVersion(selectedId, versionId);
      setVerifications(current => ({ ...current, [versionId]: result }));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "No se pudo verificar el archivo.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="section-content">
    <div className="section-intro">
      <span className="eyebrow">BIBLIOTECA DE VERSIONES · STELLAR</span>
      <h2>Documentos</h2>
      <p>Versiones PDF almacenadas en SeaweedFS S3, con integridad SHA-256 y evidencia de Stellar.</p>
    </div>
    <section className="panel document-workspace">
      <div className="panel-heading"><div><span className="panel-icon"><Icon name="file" size={20}/></span>
        <div><h3>Documentos por contrato</h3><p>Selecciona un contrato para consultar sus archivos inmutables.</p></div>
      </div><button className="primary-button" type="button" onClick={() => onNavigate("Contratos")}>
        <Icon name="plus" size={16}/> Cargar PDF desde Contratos
      </button></div>
      <div style={{ padding: "1rem" }}>
        <label htmlFor="document-contract">Contrato</label>
        <select id="document-contract" value={selectedId} onChange={event => {
          setSelectedId(event.target.value);
          setVerifications({});
        }} style={{ width: "100%", maxWidth: 560, marginTop: "0.5rem" }}>
          <option value="">Selecciona un contrato</option>
          {contracts.map(contract => <option value={contract.id} key={contract.id}>
            {contract.businessReference} · {contract.title}
          </option>)}
        </select>
        {error && <p className="api-message" role="alert">{error}</p>}
        {actionError && <p className="api-message" role="alert">{actionError}</p>}
        {selectedId && !detail && !error && <p role="status">Consultando versiones…</p>}
      </div>
      <div className="contracts-table-wrap"><table className="contracts-table documents-table">
        <thead><tr><th>VERSIÓN</th><th>ESTADO</th><th>SHA-256</th><th>ANCLAJE</th><th>ACCIONES</th></tr></thead>
        <tbody>{detail && detail.versions.length > 0 ? detail.versions.map(version => <tr key={version.id}>
          <td><strong>PDF · V{version.versionNumber}</strong><small>{new Date(version.createdAtUtc).toLocaleString("es-BO")}</small></td>
          <td>{version.status}</td>
          <td><code title={version.documentHash ?? ""}>{version.documentHash?.slice(0, 18) ?? "Sin hash"}…</code></td>
          <td>{version.blockchain?.status ?? "Sin firmar"}</td>
          <td><div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button className="button-secondary" type="button" disabled={busy || !version.documentHash}
              onClick={() => void download(version.id)}>Descargar</button>
            <button className="button-secondary" type="button" disabled={busy || !version.signedAtUtc}
              onClick={() => void verify(version.id)}>Verificar</button>
          </div>
          {verifications[version.id] && <small role="status">
            {verifications[version.id].verified ? "Integridad y Stellar verificados" :
              "Verificación pendiente o incompleta"}
          </small>}</td>
        </tr>) : <tr><td colSpan={5} className="empty-table-message">
          {!selectedId ? "Selecciona un contrato para consultar documentos." :
            error ? "Error al obtener los documentos." :
            !detail ? "Cargando…" : "El contrato todavía no tiene PDFs versionados."}
        </td></tr>}</tbody>
      </table></div>
    </section>
    <p className="muted-copy">La biblioteca de plantillas independiente no tiene endpoints en el MVP. Los PDF nuevos se incorporan desde el taller Stellar de Contratos.</p>
    <PageFooter/>
  </div>;
}

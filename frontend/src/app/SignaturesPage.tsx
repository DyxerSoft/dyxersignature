import { useEffect, useState } from "react";
import { getContract, listContracts, listSigners } from "../features/stellar/api";
import type { ContractDetail, ContractListItem, Signer } from "../features/stellar/types";
import { Icon } from "./Icon";
import { PageFooter } from "./DashboardPage";

/** Firma declarativa y auditada: el MVP no emite certificados digitales cualificados. */
export function SignaturesPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<ContractDetail | null>(null);
  const [signers, setSigners] = useState<Signer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void listContracts(1, 100).then(result => {
      if (live) {
        setContracts(result.items);
        if (result.items.length > 0) setSelectedId(result.items[0].id);
      }
    }).catch((cause: unknown) => {
      if (live) setError(cause instanceof Error ? cause.message : "No se pudieron consultar los contratos.");
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!selectedId) { setSigners([]); setDetail(null); return; }
    let live = true;
    setLoading(true);
    setError("");
    void Promise.all([listSigners(selectedId), getContract(selectedId)]).then(([events, contract]) => {
      if (live) { setSigners(events.signers); setDetail(contract); }
    }).catch((cause: unknown) => {
      if (live) setError(cause instanceof Error ? cause.message : "No se pudo consultar las firmas.");
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [selectedId]);

  return <div className="section-content">
    <div className="section-intro">
      <span className="eyebrow">EVENTOS DE FIRMA · STELLAR</span>
      <h2>Firmas registradas</h2>
      <p>Consulta firmantes, fechas y versiones con evidencia persistida. Las firmas se registran desde el taller de Contratos.</p>
    </div>
    <section className="panel signature-contracts">
      <div className="panel-heading"><div><span className="panel-icon"><Icon name="pen" size={20}/></span>
        <div><h3>Histórico de firmantes</h3><p>Datos consultados del endpoint de firmas del backend</p></div>
      </div><button className="primary-button" type="button" onClick={() => onNavigate(selectedId ? "Contratos:" + selectedId : "Contratos")}>
        Abrir taller de firma <Icon name="arrow" size={16}/>
      </button></div>
      <div style={{ padding: "1rem" }}>
        <label htmlFor="signature-contract">Contrato</label>
        <select id="signature-contract" value={selectedId} onChange={event => setSelectedId(event.target.value)}
          style={{ width: "100%", maxWidth: 540, marginTop: "0.5rem" }}>
          <option value="">Selecciona un contrato</option>
          {contracts.map(contract => <option key={contract.id} value={contract.id}>
            {contract.businessReference} · {contract.title}
          </option>)}
        </select>
        {error && <p className="api-message" role="alert">{error}</p>}
      </div>
      <div className="contracts-table-wrap"><table className="contracts-table">
        <thead><tr><th>FIRMANTE</th><th>VERSIÓN</th><th>FECHA</th><th>HASH DEL DOCUMENTO</th></tr></thead>
        <tbody>{signers.length === 0 ? <tr><td colSpan={4} className="empty-table-message">
          {loading ? "Consultando firmas…" : error ? "Error al consultar las firmas." :
            "No hay eventos de firma para el contrato seleccionado."}
        </td></tr> : signers.map(item => <tr key={item.id}>
          <td><strong>{item.signerName}</strong><small>{item.signerEmail ?? "Correo no registrado"}</small></td>
          <td>V{detail?.versions.find(version => version.id === item.documentVersionId)?.versionNumber ?? "?"}</td>
          <td>{new Date(item.signedAtUtc).toLocaleString("es-BO")}</td>
          <td><code title={item.documentHash}>{item.documentHash.slice(0, 22)}…</code></td>
        </tr>)}</tbody>
      </table></div>
    </section>
    <p className="muted-copy">La firma del MVP es una declaración autenticada y auditada; no sustituye una firma digital certificada.</p>
    <PageFooter/>
  </div>;
}

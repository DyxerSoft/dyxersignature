import { useEffect, useState } from "react";
import { getContract, listContracts } from "../features/stellar/api";
import type { ContractDetail, ContractListItem } from "../features/stellar/types";
import { apiRequest } from "../services/api/client";
import { Icon } from "./Icon";
import { PageFooter } from "./DashboardPage";

type AuditEvent = {
  id: string;
  documentVersionId: string | null;
  eventType: string;
  actorType: string;
  actorId: string | null;
  metadataJson: string;
  occurredAtUtc: string;
};
type AuditPage = { items: AuditEvent[]; page: number; pageSize: number; total: number };

export function TraceabilityPage({ initialContractId = "" }: { initialContractId?: string }) {
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [selectedId, setSelectedId] = useState(initialContractId);
  const [detail, setDetail] = useState<ContractDetail | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    void listContracts(1, 100).then(result => {
      if (!live) return;
      setContracts(result.items);
      if (!initialContractId && result.items.length > 0) setSelectedId(result.items[0].id);
    }).catch((cause: unknown) => {
      if (live) setError(cause instanceof Error ? cause.message : "No se pudo cargar el catálogo.");
    });
    return () => { live = false; };
  }, [initialContractId]);

  useEffect(() => { if (initialContractId) setSelectedId(initialContractId); }, [initialContractId]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); setEvents([]); return; }
    let live = true;
    setLoading(true);
    setError("");
    void Promise.all([
      getContract(selectedId),
      apiRequest<AuditPage>("/contracts/" + selectedId + "/audit?page=1&pageSize=100")
    ]).then(([contract, audit]) => {
      if (live) { setDetail(contract); setEvents(audit.items); }
    }).catch((cause: unknown) => {
      if (live) setError(cause instanceof Error ? cause.message : "No se pudo consultar la auditoría.");
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [selectedId]);

  return <div className="section-content">
    <div className="section-intro"><span className="eyebrow">TRAZABILIDAD · POSTGRESQL</span>
      <h2>Auditoría del contrato</h2><p>Historial registrado en el backend, con versiones, eventos y evidencia de firma.</p>
    </div>
    <section className="panel trace-select-panel">
      <label htmlFor="trace-contract"><span>Contrato</span><div className="trace-select-wrap">
        <Icon name="contract" size={18}/>
        <select id="trace-contract" value={selectedId} onChange={event => setSelectedId(event.target.value)}>
          <option value="">Selecciona un contrato</option>
          {contracts.map(contract => <option key={contract.id} value={contract.id}>{contract.businessReference} · {contract.title}</option>)}
        </select>
        <Icon name="chevron" size={16}/>
      </div></label>
      {error && <p className="api-message" role="alert">{error}</p>}
    </section>
    <section className="panel trace-history-panel">
      <div className="trace-history-heading"><div><span className="eyebrow">VERSIONES INMUTABLES</span>
        <h3>{detail?.businessReference ?? "Histórico de documentos"}</h3>
        <p>{detail ? detail.versions.length + " versiones registradas" : "Selecciona un contrato"}</p>
      </div>{detail && <span className={"contract-status status-" + detail.status.toLowerCase()}>{detail.status}</span>}</div>
      <div className="contracts-table-wrap"><table className="contracts-table trace-table">
        <thead><tr><th>VERSIÓN</th><th>ESTADO</th><th>MOTIVO</th><th>FIRMA</th><th>STELLAR</th><th>FECHA</th></tr></thead>
        <tbody>{!detail || detail.versions.length === 0 ? <tr><td colSpan={6} className="empty-table-message">
          {loading ? "Cargando…" : "Todavía no hay versiones para este contrato."}
        </td></tr> : detail.versions.map(version => <tr key={version.id}>
          <td><strong>V{version.versionNumber}</strong></td><td>{version.status}</td>
          <td>{version.correctionReason ?? (version.versionNumber === 1 ? "Versión inicial" : "Sin motivo")}</td>
          <td>{version.signedAtUtc ? new Date(version.signedAtUtc).toLocaleString("es-BO") : "Sin firmar"}</td>
          <td>{version.blockchain?.status ?? "No anclada"}</td>
          <td>{new Date(version.createdAtUtc).toLocaleString("es-BO")}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
    <section className="panel trace-history-panel">
      <div className="panel-heading"><div><span className="panel-icon"><Icon name="clock" size={20}/></span>
        <div><h3>Registro de auditoría</h3><p>{events.length} eventos más recientes, ordenados por fecha</p></div>
      </div></div>
      <div className="contracts-table-wrap"><table className="contracts-table">
        <thead><tr><th>EVENTO</th><th>ACTOR</th><th>VERSIÓN</th><th>FECHA</th></tr></thead>
        <tbody>{events.length === 0 ? <tr><td colSpan={4} className="empty-table-message">
          {loading ? "Consultando auditoría…" : error ? "Error al consultar los eventos." : "Aún no hay eventos de auditoría."}
        </td></tr> : events.map(event => <tr key={event.id}>
          <td><strong>{event.eventType}</strong></td>
          <td>{event.actorId ?? event.actorType}</td>
          <td>{detail?.versions.find(version => version.id === event.documentVersionId)?.versionNumber ?? "—"}</td>
          <td>{new Date(event.occurredAtUtc).toLocaleString("es-BO")}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
    <PageFooter/>
  </div>;
}

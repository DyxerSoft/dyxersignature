import { useEffect, useState } from "react";
import { listContracts } from "../features/stellar/api";
import type { ContractListItem } from "../features/stellar/types";
import { StellarMvp } from "../features/stellar/StellarMvp";
import { Icon } from "./Icon";
import { PageFooter } from "./DashboardPage";

const statusNames: Record<string, string> = {
  Draft: "Borrador", Observed: "Observado", InSignature: "Esperando firma",
  Active: "Firmado", Rejected: "Rechazado", Cancelled: "Cancelado", Closed: "Cerrado"
};

/** Contratos usa exclusivamente las rutas REST implementadas por el backend Stellar. */
export function ContractsPage({
  onNavigate, initialView = "stellar", initialContractId = ""
}: {
  onNavigate: (page: string) => void;
  initialView?: "stellar" | "list";
  initialContractId?: string;
}) {
  const [activeTab, setActiveTab] = useState<"stellar" | "list">(initialView);
  const [selectedContractId, setSelectedContractId] = useState(initialContractId);
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialContractId) {
      setSelectedContractId(initialContractId);
      setActiveTab("stellar");
    }
  }, [initialContractId]);

  useEffect(() => {
    if (activeTab !== "list") return;
    let live = true;
    setLoading(true);
    setError("");
    void listContracts(page, 25).then(response => {
      if (!live) return;
      setContracts(response.items);
      setTotal(response.total);
    }).catch((cause: unknown) => {
      if (live) setError(cause instanceof Error ? cause.message : "No se pudo obtener el listado.");
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [activeTab, page]);

  return <div className="section-content">
    <div className="section-intro">
      <span className="eyebrow">GESTIÓN DOCUMENTAL · STELLAR</span>
      <h2>Contratos</h2>
      <p>Contratos, correcciones, firmas y verificación respaldados por PostgreSQL y Stellar Testnet.</p>
    </div>
    <div role="tablist" aria-label="Vistas del módulo de contratos" style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
      <button role="tab" type="button" aria-selected={activeTab === "stellar"}
        className={activeTab === "stellar" ? "status-pill" : "button-secondary"}
        onClick={() => setActiveTab("stellar")}>
        <Icon name="shield" size={16}/> Taller Stellar · Crear y firmar
      </button>
      <button role="tab" type="button" aria-selected={activeTab === "list"}
        className={activeTab === "list" ? "status-pill" : "button-secondary"}
        onClick={() => setActiveTab("list")}>
        <Icon name="contract" size={16}/> Listado de contratos
      </button>
    </div>
    {activeTab === "stellar" ? <div role="tabpanel">
      <StellarMvp key={selectedContractId || "new"} initialContractId={selectedContractId}/>
      <p className="muted-copy">La digitalización OCR avanzada está en integración y no forma parte del flujo Stellar validado para esta demo.</p>
    </div> : <div role="tabpanel">
      <section className="panel contract-index">
        <div className="panel-heading">
          <div><span className="panel-icon"><Icon name="contract" size={20}/></span>
            <div><h3>Contratos registrados</h3><p>{total} contratos consultados desde la API</p></div>
          </div>
          <button className="primary-button" type="button" onClick={() => {
            setSelectedContractId(""); setActiveTab("stellar");
          }}><Icon name="plus" size={16}/> Nuevo contrato</button>
        </div>
        {error && <p className="api-message" role="alert">{error}</p>}
        <div className="contracts-table-wrap"><table className="contracts-table">
          <thead><tr><th>CONTRATO</th><th>ESTADO</th><th>FECHA</th><th>ACCIONES</th></tr></thead>
          <tbody>{contracts.length === 0 ? <tr>
            <td className="empty-table-message" colSpan={4}>
              {loading ? "Cargando…" : error ? "El servicio no está disponible." : "Todavía no hay contratos registrados."}
            </td>
          </tr> : contracts.map(contract => <tr key={contract.id}>
            <td><strong>{contract.title}</strong><small>{contract.businessReference}</small></td>
            <td><span className={"contract-status status-" + contract.status.toLowerCase()}>
              {statusNames[contract.status] ?? contract.status}</span></td>
            <td>{new Date(contract.createdAtUtc).toLocaleDateString("es-BO")}</td>
            <td><div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              <button className="button-secondary" type="button" onClick={() => {
                setSelectedContractId(contract.id); setActiveTab("stellar");
              }}>Abrir contrato</button>
              <button className="text-link" type="button" onClick={() => onNavigate("Trazabilidad:" + contract.id)}>
                Ver auditoría <Icon name="arrow" size={14}/>
              </button>
            </div></td>
          </tr>)}</tbody>
        </table></div>
        {total > 25 && <div style={{ padding: "1rem", display: "flex", alignItems: "center", gap: "1rem" }}>
          <button className="button-secondary" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>Anterior</button>
          <span>Página {page} de {Math.ceil(total / 25)}</span>
          <button className="button-secondary" disabled={page * 25 >= total || loading} onClick={() => setPage(p => p + 1)}>Siguiente</button>
        </div>}
      </section>
    </div>}
    <PageFooter/>
  </div>;
}

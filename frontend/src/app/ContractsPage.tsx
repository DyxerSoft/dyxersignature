import { useEffect, useState } from "react";
import { getContracts, type ContractListItem } from "../features/contracts/api";
import { ContractWorkbench } from "../features/contracts/ContractWorkbench";
import { StellarMvp } from "../features/stellar/StellarMvp";
import { Icon } from "./Icon";
import { PageFooter } from "./DashboardPage";

const statusNames: Record<string, string> = {
  Draft: "Borrador",
  Observed: "Observado",
  InSignature: "Esperando firma",
  Active: "Firmado",
  Rejected: "Rechazado",
  Cancelled: "Cancelado",
  Closed: "Cerrado"
};

export function ContractsPage({
  onNavigate,
  initialView = "stellar",
  initialContractId = ""
}: {
  onNavigate: (page: string) => void;
  initialView?: "workbench" | "list" | "stellar";
  initialContractId?: string;
}) {
  const [activeTab, setActiveTab] = useState<"workbench" | "list" | "stellar">(initialView);
  const [selectedContractId, setSelectedContractId] = useState(initialContractId);
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);

  async function refreshContracts() {
    setLoading(true);
    try {
      const items = await getContracts();
      setContracts(items);
      setAvailable(true);
    } catch {
      setAvailable(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "list") {
      void refreshContracts();
    }
  }, [activeTab]);

  return (
    <div className="section-content">
      <div className="section-intro">
        <span className="eyebrow">GESTIÓN DOCUMENTAL</span>
        <h2>Contratos</h2>
        <p>Módulo de digitalización, ingesta OCR y registro oficial de contratos.</p>
      </div>

      <div
        role="tablist"
        aria-label="Vistas del módulo de contratos"
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1.25rem"
        }}
      >
        <button
          role="tab"
          type="button"
          aria-selected={activeTab === "workbench"}
          aria-controls="panel-workbench"
          id="tab-view-workbench"
          className={activeTab === "workbench" ? "status-pill" : "button-secondary"}
          style={{
            cursor: "pointer",
            background: activeTab === "workbench" ? "var(--color-primary)" : "var(--color-surface)",
            color: activeTab === "workbench" ? "#fff" : "inherit",
            border: "1px solid var(--color-border)",
            padding: "0.55rem 1.15rem",
            borderRadius: "var(--radius-sm)",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem"
          }}
          onClick={() => setActiveTab("workbench")}
        >
          <Icon name="pen" size={16} />
          <span>Taller de Ingesta y OCR (Modo B)</span>
        </button>

        <button
          role="tab"
          type="button"
          aria-selected={activeTab === "list"}
          aria-controls="panel-list"
          id="tab-view-list"
          className={activeTab === "list" ? "status-pill" : "button-secondary"}
          style={{
            cursor: "pointer",
            background: activeTab === "list" ? "var(--color-primary)" : "var(--color-surface)",
            color: activeTab === "list" ? "#fff" : "inherit",
            border: "1px solid var(--color-border)",
            padding: "0.55rem 1.15rem",
            borderRadius: "var(--radius-sm)",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem"
          }}
          onClick={() => setActiveTab("list")}
        >
          <Icon name="contract" size={16} />
          <span>Listado de Contratos</span>
          {contracts.length > 0 && <b className="nav-count">{contracts.length}</b>}
        </button>

        <button
          role="tab"
          type="button"
          aria-selected={activeTab === "stellar"}
          className={activeTab === "stellar" ? "status-pill" : "button-secondary"}
          style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
          onClick={() => setActiveTab("stellar")}
        >
          <Icon name="shield" size={16} />
          Stellar Testnet · MVP
        </button>
      </div>

      {activeTab === "workbench" ? (
        <div role="tabpanel" id="panel-workbench" aria-labelledby="tab-view-workbench">
          <ContractWorkbench initialContractId={selectedContractId} />
        </div>
      ) : activeTab === "stellar" ? (
        <div role="tabpanel" id="panel-stellar"><StellarMvp /></div>
      ) : (
        <div role="tabpanel" id="panel-list" aria-labelledby="tab-view-list">
          <section className="panel contract-index">
            <div className="panel-heading">
              <div>
                <span className="panel-icon">
                  <Icon name="contract" size={20} />
                </span>
                <div>
                  <h3>Listado de contratos</h3>
                  <p>{contracts.length} contratos registrados en el sistema</p>
                </div>
              </div>
              <button
                type="button"
                className="primary-button"
                style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
                onClick={() => {
                  setSelectedContractId("");
                  setActiveTab("workbench");
                }}
              >
                <Icon name="plus" size={16} />
                <span>Digitalizar nuevo contrato</span>
              </button>
            </div>

            <div className="contracts-table-wrap">
              <table className="contracts-table">
                <thead>
                  <tr>
                    <th>CONTRATO</th>
                    <th>VERSIONES</th>
                    <th>ESTADO</th>
                    <th>ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.length === 0 ? (
                    <tr>
                      <td className="empty-table-message" colSpan={4}>
                        {loading
                          ? "Cargando contratos…"
                          : available
                          ? "No hay contratos registrados. Haz clic en 'Digitalizar nuevo contrato' para comenzar."
                          : "No se pudo consultar el catálogo central de contratos. Puedes digitalizar o buscar por ID directamente en el Taller de Ingesta."}
                      </td>
                    </tr>
                  ) : (
                    contracts.map((contract) => (
                      <tr key={contract.id}>
                        <td>
                          <strong>{contract.businessReference}</strong>
                          <small>{contract.id}</small>
                        </td>
                        <td>{contract.versionCount}</td>
                        <td>
                          <span className={`contract-status status-${contract.status.toLowerCase()}`}>
                            {statusNames[contract.status] ?? contract.status}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                            <button
                              type="button"
                              className="button-secondary"
                              style={{ minHeight: "32px", fontSize: "0.8rem", padding: "0.25rem 0.65rem" }}
                              onClick={() => {
                                setSelectedContractId(contract.id);
                                setActiveTab("workbench");
                              }}
                            >
                              Abrir en Taller
                            </button>
                            <button
                              type="button"
                              className="text-link"
                              onClick={() => onNavigate(`Trazabilidad:${contract.id}`)}
                            >
                              Ver trazabilidad <Icon name="arrow" size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      <PageFooter />
    </div>
  );
}

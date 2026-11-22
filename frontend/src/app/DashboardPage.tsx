import { useEffect, useState } from "react";
import { getDashboard } from "../features/stellar/api";
import type { DashboardMetrics } from "../features/stellar/types";
import { Icon, type IconName } from "./Icon";

/** Indicadores de PostgreSQL. No se presentan valores inventados para la demo. */
export function DashboardPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    void getDashboard().then(result => {
      if (live) { setMetrics(result); setError(""); }
    }).catch((cause: unknown) => {
      if (live) setError(cause instanceof Error ? cause.message : "No se pudo consultar el Dashboard.");
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const cards: { title: string; value: number; icon: IconName; tone: string; detail: string }[] = metrics ? [
    { title: "Contratos", value: metrics.contracts.total, icon: "contract", tone: "violet", detail: "Registrados en PostgreSQL" },
    { title: "Versiones PDF", value: metrics.documents.versions, icon: "file", tone: "blue", detail: "Documentos versionados" },
    { title: "Firmas registradas", value: metrics.signatures.total, icon: "pen", tone: "green", detail: metrics.signatures.thisMonth + " este mes" },
    { title: "Anclajes pendientes", value: metrics.blockchain.pending, icon: "clock", tone: "amber", detail: "Outbox Stellar Testnet" }
  ] : [];

  const statusItems = Object.entries(metrics?.contracts.byStatus ?? {});
  const maximumStatus = Math.max(1, ...statusItems.map(([, count]) => count));
  const histogram = [
    { label: "1 vez", count: metrics?.signatures.frequency?.one ?? 0 },
    { label: "2 veces", count: metrics?.signatures.frequency?.two ?? 0 },
    { label: "3 veces", count: metrics?.signatures.frequency?.three ?? 0 },
    { label: "4 veces", count: metrics?.signatures.frequency?.four ?? 0 },
    { label: "5+ veces", count: metrics?.signatures.frequency?.fivePlus ?? 0 }
  ];
  const maximumFrequency = Math.max(1, ...histogram.map(item => item.count));

  return <div className="dashboard-content">
    <div className="welcome-row">
      <div>
        <span className="eyebrow">DATOS REALES · STELLAR TESTNET</span>
        <h2>Resumen de operaciones</h2>
        <p>Indicadores del backend en PostgreSQL, sin datos de ejemplo artificiales.</p>
      </div>
      {metrics && <span className="date-filter">Actualizado {new Date(metrics.generatedAtUtc).toLocaleString("es-BO")}</span>}
    </div>
    {loading && <p role="status">Cargando indicadores…</p>}
    {error && <div className="api-message" role="alert">No se pudo obtener el Dashboard: {error}</div>}
    {metrics && <>
      <section className="stats-grid" aria-label="Resumen de gestión">
        {cards.map(card => <article className="stat-card" key={card.title}>
          <div className={"stat-icon " + card.tone}><Icon name={card.icon} size={23}/></div>
          <div className="stat-details">
            <span>{card.title}</span>
            <strong>{card.value.toLocaleString("es-BO")}</strong>
            <small>{card.detail}</small>
          </div>
        </article>)}
      </section>
      <section className="analytics-grid">
        <article className="panel activity-panel">
          <div className="panel-heading"><div><span className="panel-icon"><Icon name="chart" size={19}/></span>
            <div><h3>Firmas por contrato</h3><p>Distribución real de frecuencia de firmas registradas</p></div>
          </div></div>
          <div className="frequency-summary">
            <div><span>Promedio de firmas por contrato</span><strong>{metrics.signatures.averagePerContract.toFixed(2)} <small>veces</small></strong></div>
            <div><span>Horas promedio hasta primera firma</span><strong>{metrics.signatures.averageHoursToFirstSignature.toFixed(2)} <small>h</small></strong></div>
          </div>
          <div className="frequency-bars" style={{ minHeight: 180, alignItems: "end", paddingTop: 16 }} aria-label="Frecuencia de firmas">
            {histogram.map(item => <div className="frequency-col" key={item.label}>
              <strong>{item.count}</strong>
              <div className="freq-bar" style={{ height: Math.max(5, item.count / maximumFrequency * 130) + "px" }}/>
              <span>{item.label}</span>
            </div>)}
          </div>
          <p className="muted-copy">Solo contratos que tienen al menos una firma. Los contratos sin firma no forman parte del histograma.</p>
        </article>
        <article className="panel contracts-panel">
          <div className="panel-heading"><div><span className="panel-icon"><Icon name="contract" size={20}/></span>
            <div><h3>Estados de contratos</h3><p>Distribución desde el sistema transaccional</p></div>
          </div></div>
          {statusItems.length === 0 ? <p className="empty-table-message">Todavía no hay contratos registrados.</p> :
            <div style={{ padding: "1.25rem", display: "grid", gap: "1rem" }}>
              {statusItems.map(([status, count]) => <div key={status}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span>{status}</span><strong>{count} ({Math.round(count / Math.max(1, metrics.contracts.total) * 100)}%)</strong>
                </div>
                <div className="bar-track"><i style={{ display: "block", width: count / maximumStatus * 100 + "%", height: 8, background: "var(--color-primary)", borderRadius: 8 }}/></div>
              </div>)}
            </div>}
        </article>
      </section>
      <section className="panel recent-panel">
        <div className="panel-heading"><div><span className="panel-icon"><Icon name="shield" size={20}/></span>
          <div><h3>Evidencia verificable</h3><p>Los contratos y sus versiones están disponibles en los módulos de gestión</p></div>
        </div></div>
        <div style={{ padding: "1.25rem", display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          <button className="primary-button" onClick={() => onNavigate("Contratos")}>Gestionar contratos <Icon name="arrow" size={16}/></button>
          <button className="button-secondary" onClick={() => onNavigate("Documentos")}>Consultar PDFs</button>
          <button className="button-secondary" onClick={() => onNavigate("Trazabilidad")}>Ver auditoría</button>
        </div>
      </section>
    </>}
    <PageFooter/>
  </div>;
}

export function PageFooter() {
  return <footer className="dashboard-footer">
    <span>© 2026 DyxerSignature · Grupo Paz</span>
    <span><Icon name="shield" size={14}/> Evidencia SHA-256 y anclaje en Stellar Testnet</span>
  </footer>;
}

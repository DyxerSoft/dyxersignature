import { useEffect, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { getDashboard } from "../features/stellar/api";
import type { DashboardMetrics } from "../features/stellar/types";

export function DashboardPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void getDashboard().then(data => {
      if (live) { setMetrics(data); setError(""); }
    }).catch((cause: unknown) => {
      if (live) setError(cause instanceof Error ? cause.message : "No se pudo consultar la API.");
    });
    return () => { live = false; };
  }, []);

  const stats: [string, string, IconName, string, string][] = metrics ? [
    ["Documentos", String(metrics.documents.versions), "file", "violet", "Versiones de contratos"],
    ["Contratos", String(metrics.contracts.total), "contract", "blue", "Registros en PostgreSQL"],
    ["Firmas completadas", String(metrics.signatures.total), "pen", "green", metrics.signatures.thisMonth + " este mes"],
    ["Anclajes pendientes", String(metrics.blockchain.pending), "clock", "amber", "Stellar Testnet"]
  ] : [];
  const byStatus = Object.entries(metrics?.contracts.byStatus ?? {});
  const maxStatus = Math.max(1, ...byStatus.map(([, n]) => n));
  const frequency = metrics?.signatures.frequency;
  const bins = [
    ["1 vez", frequency?.one ?? 0], ["2 veces", frequency?.two ?? 0],
    ["3 veces", frequency?.three ?? 0], ["4 veces", frequency?.four ?? 0],
    ["5+ veces", frequency?.fivePlus ?? 0]
  ] as const;
  const maxFrequency = Math.max(1, ...bins.map(([, count]) => count));

  return <div className="dashboard-content">
    <div className="welcome-row"><div><span className="eyebrow">RESUMEN DE ACTIVIDAD</span>
      <h2>Panel de gestión documental</h2>
      <p>Información real del backend. Sin contadores ni actividades simulados.</p>
    </div><span className="date-filter"><span className="calendar-icon">▦</span>
      {metrics ? new Date(metrics.generatedAtUtc).toLocaleString("es-BO") : "Consultando datos…"}
    </span></div>
    {error && <p className="api-message" role="alert">{error}</p>}
    {!metrics && !error && <p role="status">Cargando indicadores de PostgreSQL…</p>}
    {metrics && <>
      <section className="stats-grid" aria-label="Resumen de gestión">
        {stats.map(([name,value,icon,tone,detail]) => <article className="stat-card" key={name}>
          <div className={"stat-icon " + tone}><Icon name={icon} size={23}/></div>
          <div className="stat-details"><span>{name}</span><strong>{value}</strong>
            <small>{detail}</small></div>
        </article>)}
      </section>
      <section className="analytics-grid">
        <article className="panel activity-panel">
          <div className="panel-heading"><div><span className="panel-icon"><Icon name="chart" size={19}/></span>
            <div><h3>Actividad de firmas</h3><p>Indicadores acumulados y del mes actual</p></div>
          </div></div>
          <div className="frequency-summary" style={{ padding: "1rem 1.5rem" }}>
            <div><span>Firmas este mes</span><strong>{metrics.signatures.thisMonth}</strong></div>
            <div><span>Firmas registradas</span><strong>{metrics.signatures.total}</strong></div>
            <div><span>Horas hasta primera firma (promedio)</span><strong>{metrics.signatures.averageHoursToFirstSignature.toFixed(2)} h</strong></div>
          </div>
          <p style={{ padding: "0 1.5rem" }}>Para ver cada evento y su evidencia, consulta la trazabilidad del contrato.</p>
        </article>
        <article className="panel contracts-panel">
          <div className="panel-heading"><div><span className="panel-icon"><Icon name="contract" size={20}/></span>
            <div><h3>Estado de contratos</h3><p>Distribución por estado actual</p></div>
          </div></div>
          <div className="donut-layout">
            <div className="donut" style={{ background: "conic-gradient(#6e24f5 " + (metrics.contracts.active / Math.max(1, metrics.contracts.total) * 100) + "%, #eae9f4 0)" }}>
              <div><strong>{metrics.contracts.total}</strong><span>Contratos</span></div>
            </div>
            <div className="status-list">
              {byStatus.length === 0 ? <p>Sin contratos</p> : byStatus.map(([status,n]) =>
                <div key={status}><span><i className="status-dot signed"/>{status}</span>
                  <b>{Math.round(n / Math.max(1,metrics.contracts.total) * 100)}%</b><small>{n}</small>
                </div>)}
            </div>
          </div>
        </article>
      </section>
      <section className="lower-grid">
        <article className="panel types-panel">
          <div className="panel-heading"><div><span className="panel-icon"><Icon name="layers" size={20}/></span>
            <div><h3>Contratos por estado</h3><p>Registros persistidos en el backend</p></div>
          </div><button className="text-link" onClick={() => onNavigate("Contratos")}>Ver contratos</button></div>
          <div className="type-list">
            {byStatus.length === 0 ? <p>Sin contratos todavía.</p> : byStatus.map(([status,n]) =>
              <div className="type-row" key={status}>
                <span className="type-symbol"><Icon name="contract" size={17}/></span>
                <span className="type-name">{status}</span>
                <div className="bar-track"><i style={{width: n / maxStatus * 100 + "%"}}/></div>
                <strong>{n}</strong>
              </div>)}
          </div>
        </article>
        <article className="panel frequency-panel">
          <div className="panel-heading"><div><span className="panel-icon"><Icon name="chart" size={20}/></span>
            <div><h3>Frecuencia de firma de contratos</h3><p>Firmas registradas por contrato</p></div>
          </div></div>
          <div className="frequency-summary"><div><span>Promedio de firmas por contrato</span>
            <strong>{metrics.signatures.averagePerContract.toFixed(2)} <small>veces</small></strong>
          </div></div>
          <div className="frequency-bars">
            {bins.map(([label,count]) => <div className="frequency-col" key={label}>
              <strong>{count}</strong>
              <div className="freq-bar" style={{height: Math.max(3,count / maxFrequency * 100) + "%"}}/>
              <span>{label}</span>
            </div>)}
          </div>
        </article>
      </section>
      <section className="panel recent-panel">
        <div className="panel-heading"><div><span className="panel-icon"><Icon name="clock" size={20}/></span>
          <div><h3>Trazabilidad y evidencia</h3><p>Consulta los movimientos directamente desde cada contrato</p></div>
        </div><button className="text-link" onClick={()=>onNavigate("Trazabilidad")}>
          Ver trazabilidad <Icon name="arrow" size={14}/>
        </button></div>
        <div style={{padding:"1.5rem"}}>Los eventos de auditoría se muestran desde el módulo Trazabilidad, sin registros de muestra.</div>
      </section>
    </>}
    <PageFooter/>
  </div>;
}

export function PageFooter() {
  return <footer className="dashboard-footer">
    <span>© 2026 DyxerSignature · Grupo Paz</span>
    <span><Icon name="shield" size={14}/> Evidencia SHA-256 y Stellar Testnet</span>
  </footer>;
}

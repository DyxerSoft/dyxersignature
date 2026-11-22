import { useEffect, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { presentation } from "./presentation";
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
  const monthlySignatures = metrics?.signatures.monthly ?? [];
  const monthlySignatureMaximum = Math.max(1, ...monthlySignatures.map(row => row.count));
  const sixMonthSignatureTotal = monthlySignatures.reduce((total, row) => total + row.count, 0);
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
      <p>Contratos, documentos y firmas registrados en el espacio de trabajo.</p>
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
            <div><h3>Actividad de firmas</h3><p>Firmas registradas durante los últimos seis meses</p></div>
          </div></div>
          <div className="signature-chart" role="img"
            aria-label={`Firmas por mes: ${monthlySignatures.map(row => `${row.month}: ${row.count}`).join(", ")}`}>
            {monthlySignatures.length === 0
              ? <div className="signature-chart-unavailable">Histórico mensual no disponible.</div>
              : <div className="signature-chart-grid">
                  {monthlySignatures.map(row => <div className="signature-chart-month" key={row.month}>
                    <strong>{row.count}</strong>
                    <div className="signature-chart-track">
                      <div className="signature-chart-bar"
                        style={{height: `${row.count / monthlySignatureMaximum * 100}%`}} />
                    </div>
                    <span>{monthLabel(row.month)}</span>
                  </div>)}
                </div>
            }
          </div>
          <div className="signature-metric-strip" aria-label="Resumen de firmas">
            <div><span>Firmas del mes</span><strong>{metrics.signatures.thisMonth}</strong></div>
            <div><span>Últimos 6 meses</span><strong>{monthlySignatures.length ? sixMonthSignatureTotal : "—"}</strong></div>
            <div><span>Tiempo medio a primera firma</span>
              <strong>{metrics.signatures.total === 0 ? "—" : `${metrics.signatures.averageHoursToFirstSignature.toFixed(2)} h`}</strong>
            </div>
          </div>
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
      <section className="panel recent-panel" aria-label="Actividad documental">
        <div className="panel-heading"><div><span className="panel-icon"><Icon name="clock" size={20}/></span>
          <div><h3>Contratos con actividad reciente</h3><p>Un contrato por fila, con su último movimiento y acceso al historial completo</p></div>
        </div><button className="text-link" onClick={()=>onNavigate("Trazabilidad")}>
          Ver trazabilidad <Icon name="arrow" size={14}/>
        </button></div>
        <div className="activity-timeline">
          {(metrics.recentActivity ?? []).length === 0 ?
            <p className="empty-activity">La actividad de contratos aparecerá aquí cuando se registren movimientos.</p> :
            (metrics.recentActivity ?? []).map(event=>
              <button className="activity-event" key={event.contractId}
                onClick={()=>onNavigate("Trazabilidad:"+event.contractId)}>
                <span className="activity-marker"><Icon name="file" size={16}/></span>
                <span className="activity-details">
                  <strong>{eventName(event.eventType)}</strong>
                  <small>{event.title || event.businessReference} · {event.eventCount ?? 1} movimientos</small>
                </span>
                <time dateTime={event.occurredAtUtc}>
                  {new Date(event.occurredAtUtc).toLocaleString("es-BO")}
                </time>
                <Icon name="arrow" size={15}/>
              </button>
            )}
        </div>
      </section>
      <section className="panel stellar-health-panel" aria-label="Indicadores operativos Stellar">
        <div className="panel-heading"><div><span className="panel-icon"><Icon name="shield" size={20}/></span>
          <div><h3>Estado de validación en Stellar</h3>
            <p>Seguimiento de los anclajes y sus confirmaciones</p>
          </div>
        </div></div>
        <div className="stellar-kpi-grid">
          <div className="stellar-kpi"><span>Confirmados</span><strong>{numberOrDash(metrics.blockchain.confirmed)}</strong></div>
          <div className="stellar-kpi"><span>En proceso</span><strong>{metrics.blockchain.pending.toLocaleString("es-BO")}</strong></div>
          <div className="stellar-kpi"><span>Con incidencias</span><strong>{numberOrDash(metrics.blockchain.failed)}</strong></div>
          <div className="stellar-kpi"><span>Con reintentos</span><strong>{numberOrDash(metrics.blockchain.retrying)}</strong></div>
          <div className="stellar-kpi"><span>Confirmados en 1 hora</span><strong>{numberOrDash(metrics.blockchain.confirmedLastHour)}</strong></div>
          <div className="stellar-kpi"><span>Mayor tiempo de espera</span><strong>{
            typeof metrics.blockchain.oldestPendingSeconds === "number"
              ? (metrics.blockchain.oldestPendingSeconds / 60).toFixed(1)+" min" : "—"
          }</strong></div>
        </div>
      </section>
    </>}
    <PageFooter/>
  </div>;
}

export function PageFooter() {
  return <footer className="dashboard-footer">
    <span>© 2026 {presentation.product} · {presentation.provider}</span>
    <span><Icon name="shield" size={14}/> Evidencia SHA-256 y Stellar Testnet</span>
  </footer>;
}

function monthLabel(isoMonth: string) {
  const [year, month] = isoMonth.split("-").map(Number);
  return new Intl.DateTimeFormat("es-BO", {month: "short", timeZone: "UTC"})
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

function numberOrDash(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString("es-BO") : "—";
}

function eventName(event: string) {
  const labels: Record<string,string> = {
    "CONTRACT_CREATED": "Contrato registrado",
    "CONTRACT_CREATED_V1": "Contrato registrado",
    "DOCUMENT_VERSION_DRAFT_UPLOADED": "Documento incorporado",
    "DOCUMENT_VERSION_REVIEWED": "Revisión documental completada",
    "DOCUMENT_VERSION_SIGNED": "Firma registrada",
    "BLOCKCHAIN_CONFIRMED_AND_VERSION_ACTIVATED": "Documento verificado en Stellar",
    "BLOCKCHAIN_CONFIRMED_HISTORICAL_VERSION": "Versión histórica verificada",
    "CONTRACT_TITLE_UPDATED": "Información del contrato actualizada",
    "CONTRACT_SOFT_DELETED": "Contrato archivado",
    "DOCUMENT_VIEWED": "Documento consultado",
    "DOCUMENT_DOWNLOADED": "Documento descargado",
    "DOCUMENT_DOWNLOAD_LINK_ISSUED": "Descarga de documento autorizada",
    "DOCUMENT_VERIFICATION_REQUESTED": "Integridad documental consultada",
    "CONTRACT_DELETED": "Contrato archivado"
  };
  return labels[event] ?? "Actualización contractual";
}

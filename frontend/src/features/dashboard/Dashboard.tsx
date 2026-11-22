import { useEffect, useState } from "react";
import { getDashboard } from "../contracts/api";
import type { DashboardMetrics } from "../contracts/types";

export function Dashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const result = await getDashboard();
        if (alive) {
          setMetrics(result);
          setError("");
        }
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : "No se pudieron cargar las métricas.");
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section className="dashboard" aria-labelledby="dashboard-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Datos persistidos</span>
          <h2 id="dashboard-title">Dashboard</h2>
        </div>
        {metrics && <span className="muted-copy">Actualizado {new Date(metrics.generatedAtUtc).toLocaleTimeString()}</span>}
      </div>
      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="metric-grid">
        <Metric label="Contratos" value={metrics?.contracts.total} detail={`${metrics?.contracts.active ?? 0} activos`} />
        <Metric label="Versiones" value={metrics?.documents.versions} detail="Documentos inmutables" />
        <Metric label="Firmas" value={metrics?.signatures.total} detail={`${metrics?.signatures.thisMonth ?? 0} este mes`} />
        <Metric label="Firmas por contrato" value={metrics?.signatures.averagePerContract} detail="Promedio histórico" />
        <Metric label="Horas a primera firma" value={metrics?.signatures.averageHoursToFirstSignature} detail="Promedio real" />
        <Metric label="Anclajes pendientes" value={metrics?.blockchain.pending} detail="Cola Stellar" />
      </div>
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: number | undefined; detail: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value === undefined ? "—" : value}</strong>
      <small>{detail}</small>
    </article>
  );
}


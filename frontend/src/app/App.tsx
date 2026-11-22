import { useEffect, useState } from "react";
import { ContractWorkbench } from "../features/contracts/ContractWorkbench";
import { Dashboard } from "../features/dashboard/Dashboard";
import { initializeDemoSession } from "../services/api/client";

export function App() {
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState("");

  useEffect(() => {
    void initializeDemoSession()
      .then(() => setSessionReady(true))
      .catch((cause: unknown) => {
        setSessionError(cause instanceof Error ? cause.message : "No se pudo iniciar la sesión de demostración.");
      });
  }, []);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <span className="eyebrow">Grupo Paz</span>
          <h1>DyxerSignature</h1>
          <p>Contratos, firmas y evidencia documental verificable.</p>
        </div>
        <span className="status-pill">Stellar Testnet</span>
      </header>

      <section className="module-grid" aria-label="Módulos principales">
        <article className="module-card"><h2>Dashboard</h2><p>Métricas calculadas desde PostgreSQL.</p></article>
        <article className="module-card"><h2>Contratos</h2><p>Versiones, motivos de corrección e histórico.</p></article>
        <article className="module-card"><h2>Firmas</h2><p>Revisión explícita y trazabilidad de firmantes.</p></article>
        <article className="module-card"><h2>Verificación</h2><p>SHA-256 del PDF y transacción Stellar.</p></article>
      </section>

      {!sessionReady && !sessionError && <p className="muted-copy session-status">Iniciando sesión de demostración…</p>}
      {sessionError && (
        <div className="error-panel" role="alert">
          <strong>Sesión no disponible</strong>
          <p>{sessionError}</p>
          <p>El token de demostración solo se habilita cuando la API ASP.NET Core se ejecuta en Development.</p>
        </div>
      )}
      {sessionReady && <Dashboard />}
      {sessionReady && <ContractWorkbench />}
    </main>
  );
}


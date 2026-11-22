import { useEffect, useState } from "react";
import { initializeDemoSession } from "../../services/api/client";
import { Dashboard } from "../dashboard/Dashboard";
import { ContractWorkbench } from "./ContractWorkbench";
import "./stellar.css";

/**
 * Demo Stellar aislada del taller OCR: se conserva la interfaz administrativa de main.
 * El token de Development no debe utilizarse en producción.
 */
export function StellarMvp() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    void initializeDemoSession().then(() => {
      if (mounted) setReady(true);
    }).catch((cause: unknown) => {
      if (mounted) setError(cause instanceof Error ? cause.message : "No se pudo iniciar la sesión de demostración.");
    });
    return () => { mounted = false; };
  }, []);

  return (
    <section className="stellar-mvp">
      <header className="stellar-mvp__header">
        <div><span className="eyebrow">FLUJO DE FIRMA VERIFICABLE</span>
        <h2>Contratos y evidencia en Stellar Testnet</h2>
        <p>Crear, revisar, firmar, verificar y descargar versiones de contratos de forma trazable.</p></div>
        <span className="status-pill">Stellar Testnet</span>
      </header>
      {!ready && !error && <p role="status">Conectando a la API de demostración…</p>}
      {error && <div className="error-message" role="alert">
        <strong>Sesión no disponible.</strong> {error}
        <p>La autenticación de desarrollo no está habilitada en modo Production.
        Para entornos públicos debe configurarse un proveedor de autenticación real.</p>
      </div>}
      {ready && <><Dashboard /><ContractWorkbench /></>}
    </section>
  );
}

import { Dashboard } from "../dashboard/Dashboard";
import { ContractWorkbench } from "./ContractWorkbench";
import "./stellar.css";

/** El JWT ya fue inicializado por App antes de montar cualquier pantalla. */
export function StellarMvp({ initialContractId = "" }: { initialContractId?: string }) {
  return <section className="stellar-mvp">
    <header className="stellar-mvp__header">
      <div>
        <span className="eyebrow">FLUJO DE FIRMA VERIFICABLE</span>
        <h2>Contratos y evidencia en Stellar Testnet</h2>
        <p>Crear, revisar, firmar, verificar y descargar versiones de contratos de forma trazable.</p>
      </div>
      <span className="status-pill">Stellar Testnet</span>
    </header>
    <Dashboard />
    <ContractWorkbench initialContractId={initialContractId} />
  </section>;
}

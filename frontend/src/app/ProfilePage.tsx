import { Icon } from "./Icon";
import { PageFooter } from "./DashboardPage";

const details = [
  { label: "Identidad de demo", value: "demo-user", icon: "user" },
  { label: "Rol JWT", value: "Admin (solo Development)", icon: "shield" },
  { label: "Red blockchain", value: "Stellar Testnet", icon: "layers" },
  { label: "Espacio de trabajo", value: "Grupo Paz · MVP", icon: "check" }
] as const;

export function ProfilePage() {
  return <div className="section-content">
    <div className="section-intro"><span className="eyebrow">ENTORNO DE DEMOSTRACIÓN</span>
      <h2>Sesión técnica del MVP</h2>
      <p>Los accesos de este entorno son temporales y solo se habilitan en Development; no representan cuentas reales de usuarios.</p>
    </div>
    <section className="panel profile-page-card">
      <div className="profile-page-heading"><div className="profile-page-avatar">DE</div>
        <div><span className="eyebrow">JWT AUTOMÁTICO</span><h3>Cuenta de demostración</h3>
          <span className="profile-role"><Icon name="shield" size={14}/> Entorno protegido</span>
        </div>
      </div>
      <div className="profile-details">{details.map(item => <div className="profile-detail" key={item.label}>
        <span className="profile-detail-icon"><Icon name={item.icon} size={18}/></span>
        <div><small>{item.label}</small><strong>{item.value}</strong></div>
      </div>)}</div>
    </section>
    <PageFooter/>
  </div>;
}

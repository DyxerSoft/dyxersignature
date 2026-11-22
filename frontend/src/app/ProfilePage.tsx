import { Icon } from "./Icon";
import { PageFooter } from "./DashboardPage";
import { presentation } from "./presentation";

const details = [
  { label: "Espacio de trabajo", value: presentation.workspace, icon: "layers" },
  { label: "Producto", value: presentation.product, icon: "shield" },
  { label: "Proveedor de tecnología", value: presentation.provider, icon: "check" },
  { label: "Perfil", value: presentation.role, icon: "user" }
] as const;

export function ProfilePage() {
  return <div className="section-content">
    <div className="section-intro"><span className="eyebrow">ADMINISTRACIÓN</span><h2>Espacio de trabajo</h2>
      <p>Información de la organización y acceso de gestión contractual.</p></div>
    <section className="panel profile-page-card">
      <div className="profile-page-heading"><div className="profile-page-avatar">{presentation.workspaceInitials}</div>
        <div><span className="eyebrow">ORGANIZACIÓN</span><h3>{presentation.workspace}</h3>
          <span className="profile-role"><Icon name="shield" size={14}/> {presentation.role}</span></div></div>
      <div className="profile-details">{details.map(item=><div className="profile-detail" key={item.label}>
        <span className="profile-detail-icon"><Icon name={item.icon} size={18}/></span>
        <div><small>{item.label}</small><strong>{item.value}</strong></div></div>)}</div>
    </section>
    <PageFooter/>
  </div>;
}

import { Icon } from "./Icon";
import { PageFooter } from "./DashboardPage";

const details = [
  { label: "Nombre completo", value: "Diego Murillo", icon: "user" },
  { label: "Correo electrónico", value: "Correo no registrado", icon: "mail" },
  { label: "Rol", value: "Superadmin", icon: "shield" },
  { label: "Espacio de trabajo", value: "Grupo Paz", icon: "layers" },
  { label: "Estado de la cuenta", value: "Activa", icon: "check" },
] as const;

export function ProfilePage() {
  return <div className="section-content">
    <div className="section-intro"><span className="eyebrow">CUENTA</span><h2>Perfil</h2><p>Consulta los datos de tu cuenta y el rol que tienes en el espacio de trabajo.</p></div>
    <section className="panel profile-page-card">
      <div className="profile-page-heading"><div className="profile-page-avatar">DM</div><div><span className="eyebrow">PERFIL DE USUARIO</span><h3>Diego Murillo</h3><span className="profile-role"><Icon name="shield" size={14}/> Superadmin</span></div></div>
      <div className="profile-details">{details.map(item=><div className="profile-detail" key={item.label}><span className="profile-detail-icon"><Icon name={item.icon} size={18}/></span><div><small>{item.label}</small><strong>{item.value}</strong></div></div>)}</div>
    </section>
    <PageFooter/>
  </div>;
}

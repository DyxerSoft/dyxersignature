import { useState } from "react";
import { ContractsPage } from "./ContractsPage";
import { DashboardPage } from "./DashboardPage";
import { DocumentsPage } from "./DocumentsPage";
import { Icon, type IconName } from "./Icon";
import { SignaturesPage } from "./SignaturesPage";
import { TraceabilityPage } from "./TraceabilityPage";
import { ProfilePage } from "./ProfilePage";
import logo from "../styles/logo dyxsersignature.png";

const navigation: {label:string;icon:IconName}[] = [
  {label:"Dashboard",icon:"home"}, {label:"Documentos",icon:"file"},
  {label:"Contratos",icon:"contract"}, {label:"Firmas",icon:"pen"}
];

function Brand() { return <div className="brand"><img className="brand-logo" src={logo} alt="DyxerSignature" /></div>; }

export function App() {
  const [active,setActive]=useState("Dashboard");
  const [menuOpen,setMenuOpen]=useState(false);
  const navigate=(page:string)=>{setActive(page);setMenuOpen(false);};
  const route=active.startsWith("Trazabilidad")?"Trazabilidad":active;
  const traceContractId=active.startsWith("Trazabilidad:")?active.slice("Trazabilidad:".length):"";
  return <div className="app-frame">
    <aside className={`sidebar ${menuOpen?"sidebar--open":""}`}>
      <Brand/>
      <div className="workspace-switch"><div className="workspace-avatar">GP</div><div><strong>Grupo Paz</strong><span>Espacio de trabajo</span></div><Icon name="chevron" size={16}/></div>
      <span className="side-caption">MENÚ PRINCIPAL</span>
      <nav className="side-nav" aria-label="Navegación principal">{navigation.map(item=><div className="nav-group" key={item.label}><button className={`nav-item ${route===item.label?"is-active":""}`} onClick={()=>navigate(item.label)}><Icon name={item.icon}/><span>{item.label}</span>{item.label==="Firmas"&&<b className="nav-count">0</b>}{item.label==="Contratos"&&<Icon name="chevron" size={15}/>}</button>{item.label==="Contratos"&&["Contratos","Trazabilidad"].includes(route)&&<div className="nav-submenu"><button className={`nav-subitem ${route==="Trazabilidad"?"is-active":""}`} onClick={()=>navigate("Trazabilidad")}>Trazabilidad</button></div>}</div>)}</nav>
      <div className="sidebar-bottom"><div className="support-card"><div className="support-icon"><Icon name="help" size={18}/></div><strong>¿Necesitas ayuda?</strong><p>Estamos aquí para ayudarte a gestionar tus documentos.</p><button onClick={()=>navigate("Documentos")}>Centro de ayuda <Icon name="arrow" size={14}/></button></div><button className={`profile-mini ${route==="Perfil"?"profile-mini--active":""}`} onClick={()=>navigate("Perfil")}><div className="profile-avatar">DM</div><div><strong>Diego Murillo</strong><span>Superadmin</span></div><Icon name="chevron" size={16}/></button></div>
    </aside>
    <main className="main-panel">
      <header className="topbar"><button className="icon-button menu-toggle" aria-label="Abrir menú" onClick={()=>setMenuOpen(!menuOpen)}><Icon name="menu"/></button><h1>{route}</h1><label className="global-search"><Icon name="search" size={19}/><input placeholder="Buscar documentos, contratos o firmantes..."/><kbd>Ctrl K</kbd></label><div className="top-actions"><button className="icon-button notification-button" aria-label="Notificaciones"><Icon name="bell"/><i/></button><button className="icon-button" aria-label="Ayuda"><Icon name="help"/></button><div className="top-divider"/><button className="top-profile" onClick={()=>navigate("Perfil")}><div className="profile-avatar">DM</div><span><strong>Diego Murillo</strong><small>Superadmin</small></span><Icon name="chevron" size={17}/></button></div></header>
      {route==="Dashboard"&&<DashboardPage onNavigate={navigate}/>}
      {route==="Documentos"&&<DocumentsPage onNavigate={navigate}/>}
      {route==="Contratos"&&<ContractsPage onNavigate={navigate}/>}
      {route==="Trazabilidad"&&<TraceabilityPage initialContractId={traceContractId}/>}
      {route==="Firmas"&&<SignaturesPage onNavigate={navigate}/>}
      {route==="Perfil"&&<ProfilePage/>}
      {!navigation.some(item=>item.label===route)&&route!=="Perfil"&&route!=="Trazabilidad"&&<DocumentsPage onNavigate={navigate}/>}
    </main>
  </div>;
}

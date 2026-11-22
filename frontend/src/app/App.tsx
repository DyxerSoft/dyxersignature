import { useEffect, useState } from "react";
import { initializeDemoSession } from "../services/api/client";
import { getDashboard } from "../features/stellar/api";
import { presentation } from "./presentation";
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
  const [sessionState,setSessionState] = useState<"loading"|"ready"|"error">("loading");
  const [sessionError,setSessionError] = useState("");
  const [signatureCount,setSignatureCount] = useState<number | null>(null);
  useEffect(()=>{
    let mounted=true;
    void initializeDemoSession().then(()=>{
      if(mounted)setSessionState("ready");
      void getDashboard().then(metrics=>{if(mounted)setSignatureCount(metrics.signatures.total);}).catch(()=>{});
    }).catch((cause:unknown)=>{
      if(!mounted)return;
      setSessionError(cause instanceof Error?cause.message:"API no disponible");
      setSessionState("error");
    });
    return()=>{mounted=false;};
  },[]);
  const [menuOpen,setMenuOpen]=useState(false);
  const navigate=(page:string)=>{setActive(page);setMenuOpen(false);};
  const route=active.startsWith("Trazabilidad")?"Trazabilidad":active;
  const traceContractId=active.startsWith("Trazabilidad:")?active.slice("Trazabilidad:".length):"";
  if(sessionState!=="ready")return <main className="section-content" style={{maxWidth:620,margin:"12vh auto"}}>
    <h1>DyxerSignature</h1>
    {sessionState==="loading"?<p role="status">Conectando a la API…</p>:
      <div className="api-message" role="alert"><strong>No se pudo conectar con el servicio.</strong>
        <p>{sessionError}</p><button type="button" onClick={()=>window.location.reload()}>Reintentar</button>
      </div>}
  </main>;
  return <div className="app-frame">
    <aside className={`sidebar ${menuOpen?"sidebar--open":""}`}>
      <Brand/>
      <div className="workspace-switch"><div className="workspace-avatar">{presentation.workspaceInitials}</div><div><strong>{presentation.workspace}</strong><span>Espacio de trabajo</span></div><Icon name="chevron" size={16}/></div>
      <span className="side-caption">MENÚ PRINCIPAL</span>
      <nav className="side-nav" aria-label="Navegación principal">{navigation.map(item=><div className="nav-group" key={item.label}><button className={`nav-item ${route===item.label?"is-active":""}`} onClick={()=>navigate(item.label)}><Icon name={item.icon}/><span>{item.label}</span>{item.label==="Firmas"&&signatureCount!==null&&<b className="nav-count">{signatureCount}</b>}{item.label==="Contratos"&&<Icon name="chevron" size={15}/>}</button>{item.label==="Contratos"&&["Contratos","Trazabilidad"].includes(route)&&<div className="nav-submenu"><button className={`nav-subitem ${route==="Trazabilidad"?"is-active":""}`} onClick={()=>navigate("Trazabilidad")}>Trazabilidad</button></div>}</div>)}</nav>
      <div className="sidebar-bottom"><div className="support-card"><div className="support-icon"><Icon name="shield" size={18}/></div><strong>Documentos verificables</strong><p>Consulta el historial contractual, la evidencia de firma y la integridad de cada versión.</p><button onClick={()=>navigate("Documentos")}>Ver documentos <Icon name="arrow" size={14}/></button></div><button className={`profile-mini ${route==="Perfil"?"profile-mini--active":""}`} onClick={()=>navigate("Perfil")}><div className="profile-avatar">{presentation.operatorInitials}</div><div><strong>{presentation.operator}</strong><span>{presentation.role}</span></div><Icon name="chevron" size={16}/></button></div>
    </aside>
    <main className="main-panel">
      <header className="topbar"><button className="icon-button menu-toggle" aria-label="Abrir menú" onClick={()=>setMenuOpen(!menuOpen)}><Icon name="menu"/></button><h1>{route}</h1><div className="topbar-description">Gestión contractual · Evidencia verificable</div><div className="top-actions"><div className="top-divider"/><button className="top-profile" onClick={()=>navigate("Perfil")}><div className="profile-avatar">{presentation.operatorInitials}</div><span><strong>{presentation.operator}</strong><small>{presentation.role}</small></span><Icon name="chevron" size={17}/></button></div></header>
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

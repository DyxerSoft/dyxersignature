import { useEffect, useState } from "react";
import { getContracts, type ContractListItem } from "../features/contracts/api";
import { Icon } from "./Icon";
import { PageFooter } from "./DashboardPage";

const statusNames: Record<string,string>={Draft:"Borrador",Observed:"Observado",InSignature:"Esperando firma",Active:"Firmado",Rejected:"Rechazado",Cancelled:"Cancelado",Closed:"Cerrado"};

export function ContractsPage({onNavigate}:{onNavigate:(page:string)=>void}) {
  const [contracts,setContracts]=useState<ContractListItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [available,setAvailable]=useState(true);
  useEffect(()=>{getContracts().then(setContracts).catch(()=>setAvailable(false)).finally(()=>setLoading(false));},[]);
  return <div className="section-content">
    <div className="section-intro"><span className="eyebrow">GESTIÓN DOCUMENTAL</span><h2>Contratos</h2><p>Contratos creados y su estado actual.</p></div>
    <section className="panel contract-index"><div className="panel-heading"><div><span className="panel-icon"><Icon name="contract" size={20}/></span><div><h3>Listado de contratos</h3><p>{contracts.length} contratos registrados</p></div></div></div>
      <div className="contracts-table-wrap"><table className="contracts-table"><thead><tr><th>CONTRATO</th><th>VERSIONES</th><th>ESTADO</th><th>ACCIONES</th></tr></thead><tbody>{contracts.length===0?<tr><td className="empty-table-message" colSpan={4}>{loading?"Cargando contratos…":available?"No hay información para mostrar.":"No se pudo cargar la información. Intenta nuevamente."}</td></tr>:contracts.map(contract=><tr key={contract.id}><td><strong>{contract.businessReference}</strong><small>{contract.id}</small></td><td>{contract.versionCount}</td><td><span className={`contract-status status-${contract.status.toLowerCase()}`}>{statusNames[contract.status]??contract.status}</span></td><td><button className="text-link" onClick={()=>onNavigate(`Trazabilidad:${contract.id}`)}>Ver trazabilidad <Icon name="arrow" size={14}/></button></td></tr>)}</tbody></table></div>
    </section><PageFooter/></div>;
}

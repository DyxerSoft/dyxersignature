import { useEffect, useState } from "react";
import { getContract, getContracts, type ContractListItem } from "../features/contracts/api";
import type { ContractDetail, ContractVersion } from "../features/contracts/types";
import { Icon } from "./Icon";
import { PageFooter } from "./DashboardPage";

function TraceItem({version}:{version:ContractVersion}){
  const uploaded=version.traceability?.find(event=>event.eventType==="SIGNED_DOCUMENT_VERSION_RECEIVED");
  return <article className="trace-item"><div className="trace-item-heading"><span className="trace-version">V{version.versionNumber}</span><strong>Versión {version.versionNumber}</strong><span className={`contract-status ${version.signedAtUtc?"status-active":"status-draft"}`}>{version.signedAtUtc?"Firmado":"Sin firmar"}</span></div>
    <div className="trace-grid"><div><span>Qué se cambió</span><strong>{uploaded?.details.changeSummary??(version.versionNumber===1?"Versión inicial del contrato":"Sin detalle registrado")}</strong></div><div><span>Motivo</span><strong>{version.correctionReason??uploaded?.details.correctionReason??(version.versionNumber===1?"Creación inicial":"Sin motivo registrado")}</strong></div><div><span>Quién realizó el cambio</span><strong>{uploaded?.actor??"Usuario no identificado"}</strong></div><div><span>Fecha</span><strong>{new Date(version.signedAtUtc??version.createdAtUtc).toLocaleString("es-BO")}</strong></div><div><span>Estado de firma</span><strong>{version.signedAtUtc?"Firmado":"Pendiente de firma"}</strong></div><div><span>Archivo</span><strong>{uploaded?.details.fileName??"Documento registrado"}</strong></div></div>
  </article>;
}

export function TraceabilityPage({initialContractId=""}:{initialContractId?:string}){
  const [contracts,setContracts]=useState<ContractListItem[]>([]);
  const [selectedId,setSelectedId]=useState(initialContractId);
  const [detail,setDetail]=useState<ContractDetail|null>(null);
  const [failed,setFailed]=useState(false);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{getContracts().then(items=>{setContracts(items);if(initialContractId)setSelectedId(initialContractId);}).catch(()=>setFailed(true)).finally(()=>setLoading(false));},[initialContractId]);
  useEffect(()=>{if(!selectedId){setDetail(null);return;}getContract(selectedId).then(setDetail).catch(()=>setDetail(null));},[selectedId]);
  return <div className="section-content"><div className="section-intro"><span className="eyebrow">AUDITORÍA DOCUMENTAL</span><h2>Trazabilidad</h2><p>Selecciona un contrato para consultar sus cambios, responsables y firmas.</p></div>
    <section className="panel trace-select-panel"><label htmlFor="trace-contract"><span>Contrato</span><div className="trace-select-wrap"><Icon name="contract" size={18}/><select id="trace-contract" value={selectedId} onChange={event=>setSelectedId(event.target.value)} disabled={loading||contracts.length===0}><option value="">{loading?"Cargando contratos…":contracts.length?"Selecciona un contrato":"No hay contratos disponibles"}</option>{contracts.map(contract=><option key={contract.id} value={contract.id}>{contract.businessReference} · {contract.status}</option>)}</select><Icon name="chevron" size={16}/></div></label>{failed&&<p className="api-message">No se pudo cargar el listado de contratos. Intenta nuevamente cuando el servicio esté disponible.</p>}</section>
    <section className="panel trace-history-panel"><div className="trace-history-heading"><div><span className="eyebrow">HISTORIAL DEL CONTRATO</span><h3>{detail?.businessReference??"Trazabilidad"}</h3><p>{detail?`${detail.versions.length} versiones registradas`:"Cambios, responsables y estado de firma"}</p></div>{detail&&<span className={`contract-status status-${detail.status.toLowerCase()}`}>{detail.status}</span>}</div><div className="contracts-table-wrap"><table className="contracts-table trace-table"><thead><tr><th>VERSIÓN</th><th>QUÉ SE CAMBIÓ</th><th>MOTIVO</th><th>QUIÉN LO CAMBIÓ</th><th>ESTADO DE FIRMA</th><th>FECHA</th></tr></thead><tbody>{!selectedId||!detail||detail.versions.length===0?<tr><td className="empty-table-message" colSpan={6}>{selectedId&&!detail?"No se pudo cargar la trazabilidad de este contrato.":"No hay información para mostrar."}</td></tr>:detail.versions.map(version=>{const uploaded=version.traceability?.find(event=>event.eventType==="SIGNED_DOCUMENT_VERSION_RECEIVED");return <tr key={version.id}><td><strong>V{version.versionNumber}</strong></td><td>{uploaded?.details.changeSummary??(version.versionNumber===1?"Versión inicial del contrato":"Sin detalle registrado")}</td><td>{version.correctionReason??uploaded?.details.correctionReason??(version.versionNumber===1?"Creación inicial":"Sin motivo registrado")}</td><td>{uploaded?.actor??"Usuario no identificado"}</td><td><span className={`contract-status ${version.signedAtUtc?"status-active":"status-draft"}`}>{version.signedAtUtc?"Firmado":"Pendiente"}</span></td><td>{new Date(version.signedAtUtc??version.createdAtUtc).toLocaleString("es-BO")}</td></tr>})}</tbody></table></div></section>
    <PageFooter/></div>;
}

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { PageFooter } from "./DashboardPage";
import { getContract, listContracts, listSigners } from "../features/stellar/api";
import type { ContractDetail, ContractListItem, Signer } from "../features/stellar/types";

export function SignaturesPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [contracts,setContracts]=useState<ContractListItem[]>([]);
  const [contractId,setContractId]=useState("");
  const [detail,setDetail]=useState<ContractDetail|null>(null);
  const [signers,setSigners]=useState<Signer[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{
    let live=true;
    void listContracts(1,100).then(page=>{
      if(!live)return;
      setContracts(page.items);
      if(page.items.length)setContractId(page.items[0].id);
    }).catch(cause=>{if(live)setError(cause instanceof Error?cause.message:"No se pudo consultar contratos.");});
    return()=>{live=false;};
  },[]);

  useEffect(()=>{
    if(!contractId){setSigners([]);setDetail(null);return;}
    let live=true;
    setLoading(true);setError("");
    void Promise.all([listSigners(contractId),getContract(contractId)]).then(([events,contract])=>{
      if(live){setSigners(events.signers);setDetail(contract);}
    }).catch(cause=>{if(live)setError(cause instanceof Error?cause.message:"No se pudo consultar firmas.");})
      .finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[contractId]);

  return <div className="section-content">
    <div className="section-intro"><span className="eyebrow">FIRMA DIGITAL</span><h2>Firmas</h2>
      <p>Consulta las firmas asociadas a cada contrato y su historial de validación.</p>
    </div>
    <section className="panel signature-contracts">
      <div className="panel-heading"><div><span className="panel-icon"><Icon name="pen" size={20}/></span>
        <div><h3>Historial de firmas por contrato</h3><p>Firmantes registrados en cada documento</p></div>
      </div><button className="text-link" type="button" onClick={()=>onNavigate("Contratos")}>
        Abrir contratos <Icon name="arrow" size={14}/></button></div>
      <div style={{padding:"1rem"}}>
        <label htmlFor="signature-contract">Contrato</label>
        <select id="signature-contract" value={contractId} onChange={event=>setContractId(event.target.value)}
          style={{marginLeft:"1rem",maxWidth:"75%"}}>
          <option value="">Selecciona un contrato</option>
          {contracts.map(c=><option key={c.id} value={c.id}>{c.businessReference} · {c.title}</option>)}
        </select>
        {error&&<p className="api-message" role="alert">{error}</p>}
      </div>
      <div className="contracts-table-wrap"><table className="contracts-table">
        <thead><tr><th>FIRMANTE</th><th>REFERENCIA</th><th>VERSIÓN</th><th>FECHA</th></tr></thead>
        <tbody>{signers.length===0?<tr><td className="empty-table-message" colSpan={4}>
          {loading?"Cargando firmas…":error?"Error consultando la API.":"No hay firmas registradas para este contrato."}
        </td></tr>:signers.map(s=><tr key={s.id}>
          <td><strong>{s.signerName}</strong><small>{s.signerEmail??"Sin correo"}</small></td>
          <td>{detail?.businessReference??"—"}</td>
          <td>V{detail?.versions.find(v=>v.id===s.documentVersionId)?.versionNumber??"?"}</td>
          <td>{new Date(s.signedAtUtc).toLocaleString("es-BO")}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
    <PageFooter/>
  </div>;
}

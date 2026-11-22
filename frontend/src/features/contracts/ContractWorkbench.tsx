import { FormEvent, useEffect, useState } from "react";
import { contractVersionFileUrl, createContract, getContract, uploadSignedVersion } from "./api";
import type { ContractDetail } from "./types";
import type { TemplateDocument } from "../documents/api";

export function ContractWorkbench({ initialContractId = "", documents, onCreated }: { initialContractId?: string; documents: TemplateDocument[]; onCreated?: (id: string) => void }) {
  const [businessReference, setBusinessReference] = useState("GP-TEST-0001");
  const [baseDocumentId,setBaseDocumentId]=useState("");
  const [contractId, setContractId] = useState(initialContractId);
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [changedBy, setChangedBy] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh(id = contractId) {
    if (!id) return;
    try { setContract(await getContract(id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo cargar el contrato."); }
  }

  useEffect(() => {
    if (!contractId) return;
    void refresh(contractId);
    const timer = window.setInterval(() => void refresh(contractId), 2500);
    return () => window.clearInterval(timer);
  }, [contractId]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    if(!baseDocumentId){setError("Selecciona un documento base para crear el contrato.");setBusy(false);return;}
    try { const created = await createContract(businessReference,baseDocumentId); setContractId(created.id); onCreated?.(created.id); await refresh(created.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo crear el contrato."); }
    finally { setBusy(false); }
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault(); if (!file || !contractId) return;
    setBusy(true); setError("");
    try {
      await uploadSignedVersion(contractId, file, changedBy, reason || undefined, changeSummary || undefined);
      setFile(null); setReason(""); setChangeSummary(""); setChangedBy(""); await refresh(contractId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo cargar el documento."); }
    finally { setBusy(false); }
  }

  const editable = !contract || ["Draft", "Observed", "Active"].includes(contract.status);
  const statusLabel: Record<string,string> = { Draft:"Borrador", Observed:"Observado", InSignature:"Esperando firma", Active:"Firmado", Rejected:"Rechazado", Cancelled:"Cancelado", Closed:"Cerrado" };

  return <section className="workbench" aria-labelledby="workbench-title">
    <div className="section-heading"><div><span className="eyebrow">GESTIÓN DOCUMENTAL</span><h2 id="workbench-title">Crear y versionar contratos</h2></div>{contract && <span className="status-pill">{statusLabel[contract.status]??contract.status}</span>}</div>
    {!contractId && <form className="form-row contract-create-form" onSubmit={handleCreate}>
      <label>Referencia de negocio<input value={businessReference} onChange={(event)=>setBusinessReference(event.target.value)} required/></label>
      <label>Documento base<select value={baseDocumentId} onChange={event=>setBaseDocumentId(event.target.value)} required disabled={!documents.length}><option value="">{documents.length?"Selecciona un modelo":"Sube primero un documento base"}</option>{documents.map(doc=><option value={doc.id} key={doc.id}>{doc.name} · {doc.category}</option>)}</select></label>
      <button disabled={busy||!documents.length} type="submit">Crear contrato</button>
    </form>}
    {contractId && editable && <form className="version-form" onSubmit={handleUpload}>
      <label>PDF firmado<input accept="application/pdf,.pdf" onChange={(event)=>setFile(event.target.files?.[0]??null)} type="file" required/></label>
      <label>Quién realiza el cambio<input value={changedBy} onChange={(event)=>setChangedBy(event.target.value)} placeholder="Nombre y apellido" required/></label>
      <label>Motivo del cambio<input value={reason} onChange={(event)=>setReason(event.target.value)} placeholder="Ej. Corrección solicitada por el cliente" required={Boolean(contract?.versions.length)}/></label>
      <label className="change-summary-field">Descripción del cambio (manual)<textarea value={changeSummary} onChange={(event)=>setChangeSummary(event.target.value)} placeholder="Describe los cambios incluidos en esta versión" rows={2} required={Boolean(contract?.versions.length)}/></label>
      <button disabled={busy||!file} type="submit">Subir versión firmada</button>
    </form>}
    {contractId && !editable && <p className="locked-contract-notice">Este contrato está esperando firma o fue rechazado. No se puede modificar en su estado actual.</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    {contract && <>
      <div className="contract-summary"><div><span>Contrato</span><strong>{contract.businessReference}</strong></div><div><span>Documento base</span><strong>{documents.find(doc=>doc.id===contract.baseDocumentId)?.name??contract.baseDocumentId}</strong></div></div>
      <div className="trace-title"><div><h3>Historial y trazabilidad</h3><p>Motivo, detalle del cambio, responsable y estado de firma por versión.</p></div></div>
      <div className="version-list">{contract.versions.map(version=>{
        const upload=version.traceability?.find(event=>event.eventType==="SIGNED_DOCUMENT_VERSION_RECEIVED");
        return <article className="version-card" key={version.id}>
          <div className="version-card__header"><strong>Versión {version.versionNumber}</strong><div className="version-file-actions"><a href={contractVersionFileUrl(contract.id,version.id)} target="_blank" rel="noreferrer" className="secondary-action">Visualizar</a><a href={contractVersionFileUrl(contract.id,version.id,true)} className="secondary-action">Descargar</a><span className={`status-pill ${version.signedAtUtc?"signed-pill":"unsigned-pill"}`}>{version.signedAtUtc?"Firmado":"Sin firmar"}</span></div></div>
          <div className="trace-grid">
            <div><span>Quién lo cambió</span><strong>{upload?.actor??"Usuario no identificado"}</strong></div>
            <div><span>Fecha</span><strong>{version.signedAtUtc?new Date(version.signedAtUtc).toLocaleString("es-BO"):"Sin fecha registrada"}</strong></div>
            <div><span>Archivo</span><strong>{upload?.details.fileName??"Nombre no disponible"}</strong></div>
            <div><span>Qué se cambió</span><strong>{upload?.details.changeSummary??(version.versionNumber===1?"Versión inicial del contrato":"Sin detalle registrado")}</strong></div>
            <div><span>Motivo</span><strong>{version.correctionReason??(version.versionNumber===1?"Creación inicial":upload?.details.correctionReason??"Sin motivo registrado")}</strong></div>
          </div>
          <dl><dt>SHA-256</dt><dd><code>{version.documentHash??"pendiente"}</code></dd><dt>Blockchain</dt><dd>{version.blockchain?.status??"pendiente"}</dd><dt>Transacción</dt><dd><code>{version.blockchain?.transactionHash??"—"}</code></dd><dt>Bloque</dt><dd>{version.blockchain?.blockNumber??"—"}</dd></dl>
        </article>;
      })}</div>
    </>}
  </section>;
}

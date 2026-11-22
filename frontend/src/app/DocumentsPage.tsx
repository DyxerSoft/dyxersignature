import { FormEvent, useEffect, useMemo, useState } from "react";
import { openDocument, getDocuments, type TemplateDocument, uploadDocument } from "../features/documents/api";
import { Icon } from "./Icon";
import { PageFooter } from "./DashboardPage";

const categories=["Contrato"];

export function DocumentsPage({ onNavigate }: { onNavigate: (page:string)=>void }) {
  const [documents,setDocuments]=useState<TemplateDocument[]>([]);
  const [name,setName]=useState("");
  const [category,setCategory]=useState(categories[0]);
  const [tagsText,setTagsText]=useState("");
  const [file,setFile]=useState<File|null>(null);
  const [query,setQuery]=useState("");
  const [categoryFilter,setCategoryFilter]=useState("Todas");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [loadError,setLoadError]=useState("");
  const [fileError,setFileError]=useState("");
  const [notice,setNotice]=useState("");

  async function refresh(){
    try{setDocuments(await getDocuments());setLoadError("");}
    catch(cause){setLoadError(cause instanceof Error?cause.message:"No se pudo cargar el catálogo.");}
  }
  useEffect(()=>{void refresh();},[]);
  const filtered=useMemo(()=>documents.filter(doc=>(categoryFilter==="Todas"||doc.category===categoryFilter)&&`${doc.name} ${doc.fileName} ${doc.category} ${doc.tags.join(" ")}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())),[documents,query,categoryFilter]);

  async function handleUpload(event:FormEvent){
    event.preventDefault();if(!file)return;
    const form=event.currentTarget as HTMLFormElement;
    setBusy(true);setError("");setNotice("");
    try{
      const saved=await uploadDocument(file,name||file.name.replace(/\.[^.]+$/,""),category,tagsText.split(",").map(tag=>tag.trim()).filter(Boolean));
      setDocuments(current=>[saved,...current]);setName("");setTagsText("");setFile(null);setNotice("Documento y contrato registrados correctamente.");form.reset();
    }catch(cause){setError(cause instanceof Error?cause.message:"No se pudo subir el documento.");}
    finally{setBusy(false);}
  }

  return <div className="section-content">
    <div className="section-intro"><span className="eyebrow">BIBLIOTECA CONTRACTUAL</span><h2>Documentos</h2><p>Consulta, registra y descarga los documentos de cada contrato.</p></div>
    <section className="panel upload-panel">
      <div className="panel-heading"><div><span className="panel-icon"><Icon name="plus" size={20}/></span><div><h3>Registrar documento PDF</h3><p>Al guardar el documento se registrará su contrato y primera versión.</p></div></div></div>
      <form className="template-upload-form" onSubmit={handleUpload}>
        <label className="upload-file-field"><span className="upload-file-icon"><Icon name="file" size={24}/></span><strong>Selecciona un documento</strong><small>{file?file.name:"PDF · hasta 24 MB"}</small><input id="template-file" type="file" accept=".pdf,application/pdf" required onChange={event=>setFile(event.target.files?.[0]??null)}/></label>
        <label>Nombre del documento<input value={name} onChange={event=>setName(event.target.value)} placeholder="Ej. Contrato de reserva de vivienda" maxLength={200}/></label>
        <label>Categoría<select value={category} onChange={event=>setCategory(event.target.value)} disabled><option>Contrato</option></select></label>
        
        <button className="primary-button" type="submit" disabled={busy||!file}><Icon name="plus" size={16}/>{busy?"Guardando…":"Guardar documento"}</button>
      </form>
      {error&&<div className="api-message" role="alert">{error}</div>}{notice&&<p className="success-message" role="status">{notice}</p>}
    </section>
    <section className="panel document-workspace">
      {fileError && <div className="api-message" role="alert" style={{marginBottom:14}}>{fileError}</div>}
      <div className="document-list-heading"><div><h3>Biblioteca documental</h3><p>{filtered.length} de {documents.length} versiones PDF</p></div><div className="documents-filter-bar"><label className="document-search"><Icon name="search" size={18}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar por nombre o etiqueta"/></label><label className="category-filter"><span>Categoría</span><select value={categoryFilter} onChange={event=>setCategoryFilter(event.target.value)}><option>Todas</option>{categories.map(item=><option key={item}>{item}</option>)}</select><Icon name="chevron" size={14}/></label></div></div>
      <div className="contracts-table-wrap"><table className="contracts-table documents-table"><thead><tr><th>DOCUMENTO</th><th>CATEGORÍA</th><th>ETIQUETAS</th><th>FECHA</th><th>ACCIONES</th></tr></thead><tbody>{filtered.length===0?<tr><td className="empty-table-message" colSpan={5}>{loadError&&!documents.length?"No se pudo cargar la información. Intenta nuevamente.":"No hay información para mostrar."}</td></tr>:filtered.map(doc=><tr key={doc.id}><td><strong>{doc.name}</strong><small>{doc.fileName}</small></td><td>{doc.category}</td><td><div className="tag-list"><em>{doc.category}</em>{doc.tags.map(tag=><i key={tag}>{tag}</i>)}</div></td><td>{new Date(doc.createdAtUtc).toLocaleDateString("es-BO")}</td><td><div className="template-actions"><button className="secondary-action" onClick={()=>{setFileError("");void openDocument(doc.id,"view").catch(cause=>setFileError(cause instanceof Error?cause.message:"No se pudo abrir el PDF."));}}><Icon name="file" size={15}/> Ver</button><button className="secondary-action" onClick={()=>{setFileError("");void openDocument(doc.id,"download").catch(cause=>setFileError(cause instanceof Error?cause.message:"No se pudo descargar el PDF."));}}><Icon name="arrow" size={15}/> Descargar</button><button className="secondary-action" onClick={()=>onNavigate("Contratos")}><Icon name="plus" size={15}/> Crear contrato</button></div></td></tr>)}</tbody></table></div>
    </section>
    <PageFooter/>
  </div>;
}

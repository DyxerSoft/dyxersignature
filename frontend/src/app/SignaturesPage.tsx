import { useState } from "react";
import { Icon } from "./Icon";
import { PageFooter } from "./DashboardPage";

export function SignaturesPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [scriptName,setScriptName]=useState("");
  return <div className="section-content"><div className="section-intro"><span className="eyebrow">FIRMA DIGITAL</span><h2>Firmas</h2><p>Configura tu firma local y consulta contratos asignados a tu cuenta.</p></div>
    <section className="panel signer-setup"><div className="panel-heading"><div><span className="panel-icon"><Icon name="shield" size={20}/></span><div><h3>Firma digital personal</h3><p>El script se ejecutará en el equipo del firmante; las claves no se envían al servidor.</p></div></div></div>
      <label className="ps1-picker"><span><Icon name="file" size={18}/></span><div><strong>{scriptName||"Selecciona tu archivo .ps1"}</strong><small>El archivo contiene material privado y permanece en este navegador. No se sube ni se ejecuta desde el servidor.</small></div><input type="file" accept=".ps1,text/plain" onChange={event=>setScriptName(event.target.files?.[0]?.name??"")}/><em>{scriptName?"Seleccionado":"Seleccionar"}</em></label>
      <div className="signer-security-note"><Icon name="help" size={17}/><p>Por seguridad, cargar el archivo no lo ejecuta ni lo guarda en la plataforma. Para habilitar la firma desde la web hace falta un agente local firmado que invoque PowerShell y devuelva el PDF firmado.</p></div>
    </section>
    <section className="panel signature-contracts"><div className="panel-heading"><div><span className="panel-icon"><Icon name="pen" size={20}/></span><div><h3>Contratos para firmar</h3><p>Contratos asignados a tu cuenta</p></div></div></div><div className="contracts-table-wrap"><table className="contracts-table"><thead><tr><th>CONTRATO</th><th>REFERENCIA</th><th>ESTADO</th><th>ACCIÓN</th></tr></thead><tbody><tr><td className="empty-table-message" colSpan={4}>No hay información para mostrar.</td></tr></tbody></table></div></section>
    <PageFooter/></div>;
}

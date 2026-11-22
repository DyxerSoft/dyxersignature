import { Icon } from "./Icon";

const stats = [
  ["Documentos", "1,248", "+12%", "file", "violet"],
  ["Contratos", "324", "+9%", "contract", "blue"],
  ["Firmas completadas", "1,102", "+18%", "pen", "green"],
  ["Firmas pendientes", "146", "+4%", "clock", "amber"]
] as const;
const types = [["Contratos",324,26,"contract"],["Anexos",268,21,"pen"],["Acuerdos",198,16,"layers"],["Poderes",142,11,"shield"],["Otros",316,25,"file"]] as const;
const activity = [12,20,27,21,24,30,37,36,29,38,47,38,35,42,50,44,55,49,45,59,68,65,57,67,61,72,80];
const pending = [2,5,9,6,7,8,12,9,8,10,16,11,10,14,18,13,13,17,22,17,24,21,16,18,20,28,36];

function ActivityChart() {
  const line = (values: number[]) => values.map((v, i) => `${22 + i * 27},${152 - v * 1.55}`).join(" ");
  return <svg className="activity-chart" viewBox="0 0 730 190" role="img" aria-label="Actividad diaria de firmas completadas y pendientes">
    {[0,1,2,3,4].map(n=><g key={n}><line x1="42" x2="716" y1={20+n*34} y2={20+n*34} className="grid-line"/><text x="4" y={24+n*34} className="axis-label">{100-n*25}</text></g>)}
    <polygon points={`22,156 ${line(activity)} 724,156`} fill="url(#fillPurple)"/><polyline points={line(pending)} className="chart-pending"/><polyline points={line(activity)} className="chart-primary"/>
    <defs><linearGradient id="fillPurple" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#762cff" stopOpacity=".23"/><stop offset="1" stopColor="#762cff" stopOpacity="0"/></linearGradient></defs>
    {[[22,"22 oct"],[157,"28 oct"],[292,"3 nov"],[427,"9 nov"],[562,"15 nov"],[697,"21 nov"]].map(([x,l])=><text key={String(l)} x={Number(x)-18} y="180" className="axis-label">{l}</text>)}
  </svg>;
}

export function DashboardPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  return <div className="dashboard-content">
    <div className="welcome-row"><div><span className="eyebrow">RESUMEN DE ACTIVIDAD</span><h2>¡Bienvenido, Diego! <span>👋</span></h2><p>Aquí tienes el resumen de la actividad de tu espacio de trabajo.</p></div><button className="date-filter"><span className="calendar-icon">▦</span> Últimos 30 días <Icon name="chevron" size={17}/></button></div>
    <section className="stats-grid" aria-label="Resumen de gestión">{stats.map(([title,value,change,icon,tone])=><article className="stat-card" key={title}><div className={`stat-icon ${tone}`}><Icon name={icon} size={23}/></div><div className="stat-details"><span>{title}</span><strong>{value}</strong><small><b><Icon name="arrow" size={12}/>{change}</b> vs. mes anterior</small></div></article>)}</section>
    <section className="analytics-grid"><article className="panel activity-panel"><div className="panel-heading"><div><span className="panel-icon"><Icon name="chart" size={19}/></span><div><h3>Actividad de firmas</h3><p>Seguimiento de firmas en los últimos 30 días</p></div></div><div className="legend"><span><i className="legend-complete"/>Completadas</span><span><i className="legend-pending"/>Pendientes</span></div></div><ActivityChart/></article>
      <article className="panel contracts-panel"><div className="panel-heading"><div><span className="panel-icon"><Icon name="contract" size={20}/></span><div><h3>Estado de contratos</h3><p>Distribución por estado actual</p></div></div></div><div className="donut-layout"><div className="donut"><div><strong>324</strong><span>Contratos</span></div></div><div className="status-list"><div><span><i className="status-dot signed"/>Firmados</span><b>68%</b><small>220</small></div><div><span><i className="status-dot in-progress"/>En proceso</span><b>18%</b><small>58</small></div><div><span><i className="status-dot waiting"/>Pendientes</span><b>9%</b><small>30</small></div><div><span><i className="status-dot expired"/>Vencidos</span><b>5%</b><small>16</small></div></div></div></article></section>
    <section className="lower-grid"><article className="panel types-panel"><div className="panel-heading"><div><span className="panel-icon"><Icon name="layers" size={20}/></span><div><h3>Documentos por tipo</h3><p>Volumen total almacenado</p></div></div><button className="text-link" onClick={()=>onNavigate("Documentos")}>Ver documentos</button></div><div className="type-list">{types.map(([label,num,pct,icon])=><div className="type-row" key={label}><span className="type-symbol"><Icon name={icon} size={17}/></span><span className="type-name">{label}</span><div className="bar-track"><i style={{width:`${pct}%`}}/></div><strong>{num}<small> ({pct}%)</small></strong></div>)}</div></article>
      <article className="panel frequency-panel"><div className="panel-heading"><div><span className="panel-icon"><Icon name="chart" size={20}/></span><div><h3>Frecuencia de firma de contratos</h3><p>Firmas por contrato en el período seleccionado</p></div></div></div><div className="frequency-summary"><div><span>Promedio de firmas por contrato</span><strong>2.1 <small>veces</small></strong></div><div><span>Tiempo promedio entre firmas</span><strong>1m 18s</strong></div></div><div className="frequency-bars">{[["1 vez",111,100],["2 veces",92,82],["3 veces",56,50],["4 veces",38,34],["5+ veces",27,24]].map(([label,count,height])=><div className="frequency-col" key={String(label)}><strong>{count}</strong><div className="freq-bar" style={{height:`${height}%`}}/><span>{label}</span></div>)}</div></article></section>
    <section className="panel recent-panel"><div className="panel-heading"><div><span className="panel-icon"><Icon name="clock" size={20}/></span><div><h3>Actividad reciente</h3><p>Últimos movimientos en tus documentos</p></div></div><button className="text-link" onClick={()=>onNavigate("Contratos")}>Ver trazabilidad <Icon name="arrow" size={14}/></button></div><div className="recent-table"><div className="recent-row recent-head"><span>DOCUMENTO</span><span>ACTIVIDAD</span><span>FECHA</span><span>ESTADO</span></div>{[["Contrato de servicios – Grupo Paz","María Fernanda Rojas","Firma completada","Hoy, 10:42","Completado"],["Acuerdo de confidencialidad","Carlos Mendoza","Documento enviado","Hoy, 09:18","Pendiente"],["Anexo laboral – V2","Ana Lucía Torres","Nueva versión creada","Ayer, 16:34","En revisión"]].map(row=><div className="recent-row" key={row[0]}><span className="doc-cell"><i><Icon name="file" size={17}/></i><b>{row[0]}<small>{row[1]}</small></b></span><span>{row[2]}</span><span>{row[3]}</span><span><em className={`table-status ${row[4]==="Completado"?"done":row[4]==="Pendiente"?"wait":"review"}`}>{row[4]}</em></span></div>)}</div></section>
    <PageFooter/>
  </div>;
}

export function PageFooter() { return <footer className="dashboard-footer"><span>© 2026 DyxerSignature · Grupo Paz</span><span><Icon name="shield" size={14}/> Tus documentos están protegidos y cifrados</span></footer>; }

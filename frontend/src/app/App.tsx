const modules = [
  ["Contratos", "Estado lógico y versión oficial vigente"],
  ["Versiones", "Histórico inmutable de documentos firmados"],
  ["Auditoría", "Timeline completo de eventos y correcciones"],
  ["Blockchain", "Anclajes Polygon y confirmaciones"],
  ["Verificación", "Validación de integridad mediante SHA-256"]
];

export function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <span className="eyebrow">Grupo Paz</span>
          <h1>DyxerSignature</h1>
          <p>Firma, evidencia y trazabilidad documental.</p>
        </div>
        <span className="status-pill">Arquitectura inicial</span>
      </header>

      <section className="module-grid" aria-label="Módulos principales">
        {modules.map(([title, description]) => (
          <article className="module-card" key={title}>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

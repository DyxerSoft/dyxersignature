import { FormEvent, useEffect, useState } from "react";
import {
  createContract,
  getContract,
  uploadSignedVersion,
  uploadScanForOcr,
  getDigitizationJob
} from "./api";
import type { ContractDetail, DigitizationJobDetail, DetectedSignature } from "./types";

function formatTruncatedHash(hash?: string | null, start = 8, end = 8): string {
  if (!hash) return "—";
  if (hash.length <= start + end) return hash;
  return `${hash.slice(0, start)}...${hash.slice(-end)}`;
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback si la API de portapapeles no está disponible
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="button-secondary"
      style={{
        minHeight: "28px",
        padding: "0.2rem 0.5rem",
        fontSize: "0.75rem",
        marginLeft: "0.5rem"
      }}
      title={copied ? "Copiado en el portapapeles" : (label ?? "Copiar al portapapeles")}
      aria-label={copied ? "Copiado" : (label ?? "Copiar al portapapeles")}
    >
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

export function ContractWorkbench() {
  const [businessReference, setBusinessReference] = useState("");
  const [contractId, setContractId] = useState("");
  const [contract, setContract] = useState<ContractDetail | null>(null);

  // REQ-DYXS-001 states
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState("");

  // REQ-DYXS-002 OCR states
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scanReason, setScanReason] = useState("");
  const [digitizationJob, setDigitizationJob] = useState<DigitizationJobDetail | null>(null);
  const [activeTab, setActiveTab] = useState<"ocr" | "pdf">("ocr");

  // Visualizador y Zoom states
  const [selectedSignatureForZoom, setSelectedSignatureForZoom] = useState<DetectedSignature | null>(null);
  const [viewerDocUrl, setViewerDocUrl] = useState<string | null>(null);
  const [viewerDocTitle, setViewerDocTitle] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh(id = contractId) {
    if (!id) return;
    const data = await getContract(id);
    setContract(data);
  }

  useEffect(() => {
    if (!contractId) return;

    const timer = window.setInterval(() => {
      void refresh(contractId);
    }, 2500);

    return () => window.clearInterval(timer);
  }, [contractId]);

  useEffect(() => {
    if (!selectedSignatureForZoom) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedSignatureForZoom(null);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedSignatureForZoom]);

  useEffect(() => {
    const handleGlobalEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !selectedSignatureForZoom && viewerDocUrl) {
        setViewerDocUrl(null);
      }
    };
    window.addEventListener("keydown", handleGlobalEscape);
    return () => window.removeEventListener("keydown", handleGlobalEscape);
  }, [selectedSignatureForZoom, viewerDocUrl]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const created = await createContract(businessReference);
      setContractId(created.id);
      await refresh(created.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear el contrato.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadPdf(event: FormEvent) {
    event.preventDefault();
    if (!file || !contractId) return;

    setBusy(true);
    setError("");

    try {
      await uploadSignedVersion(contractId, file, reason || undefined);
      setFile(null);
      setReason("");
      await refresh(contractId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar el documento.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadScan(event: FormEvent) {
    event.preventDefault();
    if (!scanFile || !contractId) return;

    setBusy(true);
    setError("");

    try {
      const res = await uploadScanForOcr(contractId, scanFile, scanReason || undefined);
      setScanFile(null);
      setScanReason("");

      const jobData = await getDigitizationJob(contractId, res.digitizationJobId);
      setDigitizationJob(jobData);
      setViewerDocUrl(`/api/v1/contracts/${contractId}/ingest/${res.digitizationJobId}/file`);
      setViewerDocTitle(`Documento Escaneado Original (${res.fileName})`);
      await refresh(contractId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Fallo durante la digitalización OCR.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workbench" aria-labelledby="workbench-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">DyxerSignature Hub</span>
          <h2 id="workbench-title">Módulo de Ingesta, OCR y Anclaje Blockchain</h2>
        </div>
        {contract && <span className="status-pill">{contract.status}</span>}
      </div>

      <form className="form-row" onSubmit={handleCreate}>
        <label>
          Referencia de negocio
          <input
            value={businessReference}
            onChange={(event) => setBusinessReference(event.target.value)}
            onFocus={(event) => event.target.select()}
            placeholder="Ej: GP-CONTRATO-001"
            autoFocus
            required
          />
        </label>
        <button disabled={busy} type="submit">
          {contractId ? "Crear nuevo contrato" : "Crear contrato"}
        </button>
      </form>

      <div style={{ marginTop: "1.5rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button
            type="button"
            className={activeTab === "ocr" ? "status-pill" : "button-secondary"}
            style={{
              cursor: "pointer",
              background: activeTab === "ocr" ? "var(--color-primary)" : "var(--color-surface)",
              color: activeTab === "ocr" ? "#fff" : "inherit",
              border: "1px solid var(--color-border)",
              padding: "0.5rem 1rem",
              borderRadius: "var(--radius-sm)",
              fontWeight: 600
            }}
            onClick={() => setActiveTab("ocr")}
          >
            Digitalización con PaddleOCR (REQ-DYXS-002)
          </button>
          <button
            type="button"
            className={activeTab === "pdf" ? "status-pill" : "button-secondary"}
            style={{
              cursor: "pointer",
              background: activeTab === "pdf" ? "var(--color-primary)" : "var(--color-surface)",
              color: activeTab === "pdf" ? "#fff" : "inherit",
              border: "1px solid var(--color-border)",
              padding: "0.5rem 1rem",
              borderRadius: "var(--radius-sm)",
              fontWeight: 600
            }}
            onClick={() => setActiveTab("pdf")}
          >
            Subir PDF firmado directo (REQ-DYXS-001)
          </button>
        </div>

        {!contractId ? (
          <div style={{
            padding: "1.25rem",
            background: "#f8fafc",
            borderRadius: "var(--radius-sm)",
            border: "1px dashed var(--color-border)",
            marginBottom: "1rem"
          }}>
            <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "0.95rem" }}>
              Para comenzar, ingresa una <strong>Referencia de negocio</strong> en el campo de arriba y haz clic en <strong>"Crear contrato"</strong>. A continuación podrás seleccionar tu archivo escaneado o imagen para procesarlo con <strong>PaddleOCR</strong>.
            </p>
          </div>
        ) : activeTab === "ocr" ? (
            <form className="form-row" onSubmit={handleUploadScan}>
              <label>
                Imagen o escaneo (PDF, PNG, JPG)
                <input
                  accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
                  onChange={(event) => setScanFile(event.target.files?.[0] ?? null)}
                  type="file"
                  required
                />
              </label>
              <label>
                Motivo / Comentarios
                <input
                  value={scanReason}
                  onChange={(event) => setScanReason(event.target.value)}
                  placeholder="Ej: Contrato físico digitalizado en ventanilla"
                />
              </label>
              <button disabled={busy || !scanFile} type="submit">
                {busy ? "Procesando PaddleOCR..." : "Digitalizar con PaddleOCR"}
              </button>
            </form>
          ) : (
            <form className="form-row" onSubmit={handleUploadPdf}>
              <label>
                PDF firmado de prueba
                <input
                  accept="application/pdf,.pdf"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  type="file"
                  required
                />
              </label>
              <label>
                Motivo de corrección
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Solo para V2+"
                />
              </label>
              <button disabled={busy || !file} type="submit">Crear versión</button>
            </form>
          )}
        </div>

      {error && <p className="error-message" role="alert">{error}</p>}

      {digitizationJob && (
        <div className="ocr-preview-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <h3 style={{ margin: 0, fontSize: "1rem" }}>
              Resultado de Digitalización OCR (Job {digitizationJob.digitizationJobId.slice(0, 8)})
            </h3>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setViewerDocUrl(`/api/v1/contracts/${contractId}/ingest/${digitizationJob.digitizationJobId}/file`);
                  setViewerDocTitle(`Escaneo Original (Job ${digitizationJob.digitizationJobId.slice(0, 8)})`);
                }}
              >
                Ver Escaneo Completo
              </button>
              <span className={`status-pill ${digitizationJob.status === "Failed" ? "pill-danger" : ""}`}>{digitizationJob.status}</span>
              {digitizationJob.status !== "Failed" && (
                <span className={`status-pill ${digitizationJob.requiresReview ? "pill-warning" : "pill-success"}`}>
                  Confianza: {(digitizationJob.confidenceScore * 100).toFixed(1)}% ({digitizationJob.requiresReview ? "Requiere Revisión" : "Válido"})
                </span>
              )}
            </div>
          </div>

          {digitizationJob.errorMessage && (
            <div style={{ marginTop: "0.5rem", padding: "0.75rem", background: "#fef2f2", border: "1px solid #f87171", borderRadius: "4px", color: "#991b1b", fontSize: "0.85rem" }}>
              <strong>Error en digitalización:</strong> {digitizationJob.errorMessage}
            </div>
          )}

          {digitizationJob.extractedTextSummary && (
            <div style={{ marginTop: "0.5rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Texto digitalizado (PP-OCRv4):</span>
              <p style={{ fontSize: "0.85rem", background: "var(--color-surface)", padding: "0.75rem", borderRadius: "4px", whiteSpace: "pre-wrap", maxHeight: "120px", overflowY: "auto", border: "1px solid var(--color-border)" }}>
                {digitizationJob.extractedTextSummary}
              </p>
            </div>
          )}

          {digitizationJob.signaturesDetected && digitizationJob.signaturesDetected.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: "0.9rem" }}>
                  Firmas Manuscritas Detectadas ({digitizationJob.signaturesDetected.length}):
                </strong>
                <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                  (Haz clic en cualquier firma para ampliarla en alta resolución)
                </span>
              </div>
              <div className="signatures-gallery">
                {digitizationJob.signaturesDetected.map((sig) => {
                  const cropUrl = `/api/v1/contracts/${contractId}/ingest/${digitizationJob.digitizationJobId}/signatures/${sig.id}/file`;
                  return (
                    <div key={sig.id} className="signature-crop-item" onClick={() => setSelectedSignatureForZoom(sig)}>
                      <img
                        src={cropUrl}
                        alt={`Firma página ${sig.pageNumber}`}
                        loading="lazy"
                        title="Haz clic para ampliar"
                      />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.25rem" }}>
                        <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                          Página {sig.pageNumber}
                        </span>
                        <span className="status-pill pill-success" style={{ fontSize: "0.75rem" }}>
                          {(sig.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <button
                        type="button"
                        className="button-secondary"
                        style={{ width: "100%", marginTop: "0.5rem" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSignatureForZoom(sig);
                        }}
                      >
                        Ver en tamaño completo
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Visor Embebido de Documento / PDF */}
      {viewerDocUrl && (
        <section className="document-viewer-card" aria-label="Visor de documento">
          <div className="document-viewer-header">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <strong>{viewerDocTitle ?? "Visor de Documento"}</strong>
            </div>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <a
                href={viewerDocUrl}
                target="_blank"
                rel="noreferrer"
                className="button-secondary"
              >
                Abrir en pestaña nueva
              </a>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setViewerDocUrl(null)}
              >
                Cerrar visor
              </button>
            </div>
          </div>
          <iframe
            src={viewerDocUrl}
            className="document-viewer-iframe"
            title={viewerDocTitle ?? "Visor de Documento"}
          />
        </section>
      )}

      {/* Modal Lightbox de Zoom para Firma Recortada */}
      {selectedSignatureForZoom && digitizationJob && (
        <div
          className="lightbox-backdrop"
          onClick={() => setSelectedSignatureForZoom(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="signature-modal-title"
            className="lightbox-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lightbox-header">
              <div>
                <h3 id="signature-modal-title" style={{ margin: 0, fontSize: "1.1rem" }}>
                  Firma Manuscrita Detectada
                </h3>
                <small style={{ color: "var(--color-text-muted)" }}>
                  Página {selectedSignatureForZoom.pageNumber} • Confianza: {(selectedSignatureForZoom.confidence * 100).toFixed(1)}%
                </small>
              </div>
              <button
                type="button"
                autoFocus
                aria-label="Cerrar modal de firma"
                className="button-secondary"
                style={{ cursor: "pointer", fontSize: "0.85rem", padding: "0.35rem 0.75rem" }}
                onClick={() => setSelectedSignatureForZoom(null)}
              >
                Cerrar
              </button>
            </div>

            <div className="lightbox-img-wrapper">
              <img
                src={`/api/v1/contracts/${contractId}/ingest/${digitizationJob.digitizationJobId}/signatures/${selectedSignatureForZoom.id}/file`}
                alt="Firma ampliada en alta resolución"
                className="lightbox-img"
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", padding: "0.75rem", borderRadius: "var(--radius-sm)" }}>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", display: "block" }}>Coordenadas (Bounding Box):</span>
                <code style={{ fontSize: "0.8rem" }}>{selectedSignatureForZoom.boundingBox}</code>
              </div>
              <a
                href={`/api/v1/contracts/${contractId}/ingest/${digitizationJob.digitizationJobId}/signatures/${selectedSignatureForZoom.id}/file`}
                download={`firma_pag_${selectedSignatureForZoom.pageNumber}.png`}
                className="status-pill"
                style={{ textDecoration: "none", background: "var(--color-primary)", color: "#fff", cursor: "pointer" }}
              >
                Descargar PNG original
              </a>
            </div>
          </div>
        </div>
      )}

      {contract && (
        <>
          <div className="contract-summary">
            <div>
              <span>Contrato</span>
              <strong>{contract.businessReference}</strong>
            </div>
            <div>
              <span>ID</span>
              <div style={{ display: "flex", alignItems: "center" }}>
                <code title={contract.id}>{formatTruncatedHash(contract.id, 8, 6)}</code>
                <CopyButton text={contract.id} label="Copiar ID de contrato" />
              </div>
            </div>
          </div>

          <div className="version-list">
            {contract.versions.map((version) => (
              <article className="version-card" key={version.id}>
                <div className="version-card__header">
                  <strong>V{version.versionNumber}</strong>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => {
                        setViewerDocUrl(`/api/v1/contracts/${contract.id}/versions/${version.id}/file`);
                        setViewerDocTitle(`Versión ${version.versionNumber} - ${contract.businessReference} (PDF Oficial)`);
                      }}
                    >
                      Ver PDF Oficial
                    </button>
                    <span className="status-pill">{version.status}</span>
                  </div>
                </div>
                <dl>
                  <dt>SHA-256</dt>
                  <dd style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
                    <code title={version.documentHash ?? ""}>
                      {version.documentHash ? formatTruncatedHash(version.documentHash, 10, 8) : "pendiente"}
                    </code>
                    {version.documentHash && (
                      <CopyButton text={version.documentHash} label="Copiar huella SHA-256" />
                    )}
                  </dd>
                  <dt>Blockchain</dt>
                  <dd>{version.blockchain?.status ?? "pendiente"}</dd>
                  <dt>TX</dt>
                  <dd style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
                    <code title={version.blockchain?.transactionHash ?? ""}>
                      {version.blockchain?.transactionHash ? formatTruncatedHash(version.blockchain.transactionHash, 10, 8) : "—"}
                    </code>
                    {version.blockchain?.transactionHash && (
                      <CopyButton text={version.blockchain.transactionHash} label="Copiar hash de transacción blockchain" />
                    )}
                  </dd>
                  <dt>Bloque</dt>
                  <dd>{version.blockchain?.blockNumber ?? "—"}</dd>
                  {version.correctionReason && (
                    <>
                      <dt>Motivo / Origen</dt>
                      <dd>{version.correctionReason}</dd>
                    </>
                  )}
                </dl>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

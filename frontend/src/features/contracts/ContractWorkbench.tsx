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
  const [ocrProgressStep, setOcrProgressStep] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<"ocr" | "pdf">("ocr");

  // Modales y Visores
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchContractId, setSearchContractId] = useState("");
  const [selectedSignatureForZoom, setSelectedSignatureForZoom] = useState<DetectedSignature | null>(null);
  const [viewerDocUrl, setViewerDocUrl] = useState<string | null>(null);
  const [viewerDocTitle, setViewerDocTitle] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  async function refresh(id = contractId) {
    if (!id) return;
    const data = await getContract(id);
    setContract((prev) => {
      if (prev && prev.id === data.id) {
        const previousConfirmed = prev.versions.filter((v) => v.blockchain?.status === "Confirmed").length;
        const currentConfirmed = data.versions.filter((v) => v.blockchain?.status === "Confirmed").length;
        if (currentConfirmed > previousConfirmed) {
          setAnnouncement(`El contrato ${data.businessReference} ha sido anclado y confirmado en la blockchain.`);
        }
      }
      return data;
    });
  }

  useEffect(() => {
    if (!contractId) return;

    const timer = window.setInterval(() => {
      void refresh(contractId);
    }, 2500);

    return () => window.clearInterval(timer);
  }, [contractId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedSignatureForZoom) {
          setSelectedSignatureForZoom(null);
        } else if (showResetConfirm) {
          setShowResetConfirm(false);
        } else if (showSearchModal) {
          setShowSearchModal(false);
        } else if (viewerDocUrl) {
          setViewerDocUrl(null);
        }
      }
    };

    const hasOpenModal = Boolean(selectedSignatureForZoom || showResetConfirm || showSearchModal);
    const previousOverflow = document.body.style.overflow;
    if (hasOpenModal) {
      document.body.style.overflow = "hidden";
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      if (hasOpenModal) {
        document.body.style.overflow = previousOverflow;
      }
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedSignatureForZoom, showResetConfirm, showSearchModal, viewerDocUrl]);

  function handleResetWorkbench() {
    setContractId("");
    setContract(null);
    setDigitizationJob(null);
    setViewerDocUrl(null);
    setViewerDocTitle(null);
    setSelectedSignatureForZoom(null);
    setFile(null);
    setScanFile(null);
    setReason("");
    setScanReason("");
    setError("");
    setBusinessReference("");
    setShowResetConfirm(false);
  }

  async function handleLoadContract(event: FormEvent) {
    event.preventDefault();
    const targetId = searchContractId.trim();
    if (!targetId) return;

    setBusy(true);
    setError("");
    try {
      const data = await getContract(targetId);
      setContract(data);
      setContractId(data.id);
      setDigitizationJob(null);
      setViewerDocUrl(null);
      setShowSearchModal(false);
      setSearchContractId("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se encontró el contrato especificado con ese ID.");
    } finally {
      setBusy(false);
    }
  }

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
    setOcrProgressStep(1);
    setError("");

    const timer1 = window.setTimeout(() => setOcrProgressStep(2), 1500);
    const timer2 = window.setTimeout(() => setOcrProgressStep(3), 3500);

    try {
      const res = await uploadScanForOcr(contractId, scanFile, scanReason || undefined);
      setScanFile(null);
      setScanReason("");

      const jobData = await getDigitizationJob(contractId, res.digitizationJobId);
      setDigitizationJob(jobData);
      setViewerDocUrl(`/api/v1/contracts/${contractId}/ingest/${res.digitizationJobId}/file`);
      setViewerDocTitle(`Documento Escaneado Original (${res.fileName})`);
      setAnnouncement(`Digitalización OCR completada. Se detectaron ${jobData.signaturesDetected?.length ?? 0} firmas manuscritas.`);
      await refresh(contractId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Fallo durante la digitalización OCR.");
    } finally {
      window.clearTimeout(timer1);
      window.clearTimeout(timer2);
      setOcrProgressStep(0);
      setBusy(false);
    }
  }

  return (
    <section className="workbench" aria-labelledby="workbench-title">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <div className="section-heading">
        <div>
          <span className="eyebrow">DyxerSignature Hub</span>
          <h2 id="workbench-title">Módulo de Ingesta, OCR y Anclaje Blockchain</h2>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            type="button"
            className="button-secondary"
            onClick={() => setShowSearchModal(true)}
            aria-label="Buscar contrato por ID"
          >
            Buscar por ID
          </button>
          {contract && (
            <>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setShowResetConfirm(true)}
                aria-label="Cerrar y cambiar de contrato"
              >
                Cerrar contrato
              </button>
              <span className="status-pill">{contract.status}</span>
            </>
          )}
        </div>
      </div>

      {!contractId ? (
        <form className="form-row" onSubmit={handleCreate}>
          <label>
            Referencia de negocio
            <input
              value={businessReference}
              onChange={(event) => {
                setBusinessReference(event.target.value);
                if (error) setError("");
              }}
              onFocus={(event) => event.target.select()}
              placeholder="Ej: GP-CONTRATO-001"
              autoFocus
              required
            />
          </label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button disabled={busy} type="submit">
              {busy ? "Creando..." : "Crear contrato"}
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => setShowSearchModal(true)}
            >
              Cargar existente
            </button>
          </div>
        </form>
      ) : (
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.85rem 1.25rem",
          background: "#f1f5f9",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--color-border)"
        }}>
          <div>
            <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", display: "block" }}>Contrato Activo:</span>
            <strong style={{ fontSize: "1.05rem" }}>{contract?.businessReference ?? contractId}</strong>
          </div>
          <button
            type="button"
            className="button-secondary"
            onClick={() => setShowResetConfirm(true)}
          >
            Cambiar contrato
          </button>
        </div>
      )}

      <div style={{ marginTop: "1.5rem" }}>
        <div
          role="tablist"
          aria-label="Modalidad de carga del contrato"
          style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              setActiveTab((prev) => (prev === "ocr" ? "pdf" : "ocr"));
            }
          }}
        >
          <button
            id="tab-ocr"
            role="tab"
            type="button"
            aria-selected={activeTab === "ocr"}
            aria-controls="panel-ocr"
            tabIndex={activeTab === "ocr" ? 0 : -1}
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
            onClick={() => {
              setActiveTab("ocr");
              if (error) setError("");
            }}
          >
            Digitalización con PaddleOCR (REQ-DYXS-002)
          </button>
          <button
            id="tab-pdf"
            role="tab"
            type="button"
            aria-selected={activeTab === "pdf"}
            aria-controls="panel-pdf"
            tabIndex={activeTab === "pdf" ? 0 : -1}
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
            onClick={() => {
              setActiveTab("pdf");
              if (error) setError("");
            }}
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
          <div role="tabpanel" id="panel-ocr" aria-labelledby="tab-ocr" tabIndex={0}>
            <form className="form-row" onSubmit={handleUploadScan}>
              <label>
                Imagen o escaneo (PDF, PNG, JPG)
                <input
                  accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
                  onChange={(event) => {
                    setScanFile(event.target.files?.[0] ?? null);
                    if (error) setError("");
                  }}
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
          </div>
        ) : (
          <div role="tabpanel" id="panel-pdf" aria-labelledby="tab-pdf" tabIndex={0}>
            <form className="form-row" onSubmit={handleUploadPdf}>
              <label>
                PDF firmado de prueba
                <input
                  accept="application/pdf,.pdf"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                    if (error) setError("");
                  }}
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
          </div>
        )}
        </div>

      {ocrProgressStep > 0 && (
        <div className="ocr-progress-banner" role="status" aria-live="polite">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: "0.95rem", color: "#005fb8" }}>
              Procesando digitalización y análisis inteligente...
            </strong>
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-muted)" }}>
              Paso {ocrProgressStep} de 3
            </span>
          </div>

          <div style={{
            height: "6px",
            background: "#dbeafe",
            borderRadius: "3px",
            marginTop: "0.75rem",
            overflow: "hidden"
          }}>
            <div style={{
              height: "100%",
              background: "#005fb8",
              width: ocrProgressStep === 1 ? "30%" : ocrProgressStep === 2 ? "70%" : "95%",
              transition: "width 0.6s ease"
            }} />
          </div>

          <div className="ocr-progress-steps">
            <div className={`ocr-progress-step ${ocrProgressStep === 1 ? "active" : ocrProgressStep > 1 ? "completed" : ""}`}>
              <span>1. Recepción y rasterización</span>
            </div>
            <div className={`ocr-progress-step ${ocrProgressStep === 2 ? "active" : ocrProgressStep > 2 ? "completed" : ""}`}>
              <span>2. Inferencia PP-OCRv4</span>
            </div>
            <div className={`ocr-progress-step ${ocrProgressStep === 3 ? "active" : ""}`}>
              <span>3. Segmentación y recorte de firmas</span>
            </div>
          </div>

          <div style={{ marginTop: "1rem", display: "grid", gap: "0.75rem" }}>
            <div className="skeleton" style={{ height: "18px", width: "40%" }} />
            <div className="skeleton" style={{ height: "50px", width: "100%" }} />
            <div style={{ display: "flex", gap: "1rem" }}>
              <div className="skeleton" style={{ height: "110px", width: "140px" }} />
              <div className="skeleton" style={{ height: "110px", width: "140px" }} />
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="error-banner" role="alert" aria-live="assertive">
          <div className="error-banner-content">
            <strong>Atención: No se pudo completar la operación</strong>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError("")}
            className="button-secondary"
            style={{ minHeight: "28px", padding: "0.25rem 0.65rem", fontSize: "0.8rem", color: "var(--color-danger)" }}
            aria-label="Descartar mensaje de error"
          >
            Descartar
          </button>
        </div>
      )}

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
      {/* Modal de Confirmación para Cerrar / Cambiar Contrato */}
      {showResetConfirm && (
        <div className="lightbox-backdrop" onClick={() => setShowResetConfirm(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reset-dialog-title"
            aria-describedby="reset-dialog-desc"
            className="lightbox-content"
            style={{ maxWidth: "480px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lightbox-header">
              <h3 id="reset-dialog-title" style={{ margin: 0, fontSize: "1.1rem" }}>
                ¿Cerrar espacio de trabajo actual?
              </h3>
            </div>
            <p id="reset-dialog-desc" style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", margin: "0.5rem 0" }}>
              El contrato activo ({contract?.businessReference ?? "en curso"}) se desvinculará de la pantalla para permitir iniciar un nuevo documento o escanear otro contrato.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setShowResetConfirm(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="status-pill pill-danger"
                style={{ cursor: "pointer", padding: "0.5rem 1rem", border: "1px solid var(--color-danger)" }}
                onClick={handleResetWorkbench}
              >
                Cerrar contrato
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Cargar Contrato Existente por ID */}
      {showSearchModal && (
        <div className="lightbox-backdrop" onClick={() => setShowSearchModal(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="search-dialog-title"
            className="lightbox-content"
            style={{ maxWidth: "520px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lightbox-header">
              <h3 id="search-dialog-title" style={{ margin: 0, fontSize: "1.1rem" }}>
                Cargar contrato existente
              </h3>
              <button
                type="button"
                aria-label="Cerrar modal de búsqueda"
                className="button-secondary"
                style={{ padding: "0.25rem 0.5rem", minHeight: "28px" }}
                onClick={() => setShowSearchModal(false)}
              >
                Cerrar
              </button>
            </div>
            <form onSubmit={handleLoadContract} style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "0.5rem" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                Identificador único de contrato (GUID):
                <input
                  value={searchContractId}
                  onChange={(e) => setSearchContractId(e.target.value)}
                  placeholder="Ej: 3fa85f64-5717-4562-b3fc-2c963f66afa6"
                  autoFocus
                  required
                />
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setShowSearchModal(false)}
                >
                  Cancelar
                </button>
                <button type="submit" disabled={busy || !searchContractId.trim()}>
                  {busy ? "Buscando..." : "Cargar contrato"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

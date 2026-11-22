import { createContract, getContract, listContracts, uploadDraftVersion } from "../stellar/api";
import { getDocumentPdf } from "../../services/api/client";

export type TemplateDocument = {
  id: string; // real documentVersionId
  contractId: string;
  name: string;
  fileName: string;
  contentType: string;
  category: string;
  tags: string[];
  createdAtUtc: string;
};

export async function getDocuments(): Promise<TemplateDocument[]> {
  const { items } = await listContracts(1, 100);
  const details = await Promise.all(items.map(item => getContract(item.id)));
  return details.flatMap(contract => contract.versions.map(version => ({
    id: version.id,
    contractId: contract.id,
    name: contract.title,
    fileName: `Versión ${version.versionNumber}.pdf`,
    contentType: "application/pdf",
    category: "Contrato",
    tags: [],
    createdAtUtc: version.createdAtUtc
  })));
}

/** The current backend stores PDF versions of contracts, not Word template catalogues. */
export async function uploadDocument(
  file: File, name: string, _category: string, _tags: string[]
): Promise<TemplateDocument> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("El MVP Stellar admite PDF; las plantillas Word requieren un endpoint aún no implementado.");
  }
  const uniqueRef = "IJ-DOC-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  const contract = await createContract(uniqueRef, name);
  const version = await uploadDraftVersion(contract.id, file);
  return {
    id: version.documentVersionId,
    contractId: contract.id,
    name,
    fileName: file.name,
    contentType: "application/pdf",
    category: "Contrato",
    tags: [],
    createdAtUtc: new Date().toISOString()
  };
}

export async function openDocument(id: string, action: "view" | "download"): Promise<void> {
  // Open synchronously on the user's click to avoid popup blockers.
  const preview = action === "view" ? window.open("about:blank", "_blank") : null;
  if (preview) {
    preview.opener = null;
    preview.document.title = "Abriendo documento · DyxerSignature";
    preview.document.body.textContent = "Preparando documento...";
  }

  try {
    const blob = await getDocumentPdf(id);
    if (blob.size === 0) throw new Error("El archivo se encuentra vacío.");
    const header = await blob.slice(0, 5).text();
    const tail = await blob.slice(Math.max(0, blob.size - 4096)).text();
    if (header !== "%PDF-" || !tail.includes("startxref") || !tail.includes("%%EOF")) {
      throw new Error("El archivo almacenado no contiene una estructura PDF completa. "
        + "El registro se conserva para auditoría; se necesita una versión corregida del documento.");
    }

    const url = URL.createObjectURL(blob);
    if (action === "view") {
      if (!preview) {
        URL.revokeObjectURL(url);
        throw new Error("El navegador bloqueó la nueva pestaña. Habilita las ventanas emergentes para este sitio.");
      }
      preview.location.replace(url);
      // The browser PDF viewer needs time to finish reading the object URL.
      window.setTimeout(() => URL.revokeObjectURL(url), 300000);
    } else {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `dyxersignature-${id}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  } catch (cause) {
    if (preview && !preview.closed) preview.close();
    throw cause;
  }
}

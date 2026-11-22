import { createContract, getContract, getDownloadUrl, listContracts, uploadDraftVersion } from "../stellar/api";

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
  const uniqueRef = "GP-DEMO-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
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
  // A presigned link requires JWT on the API but does not expose the JWT to S3.
  const response = await getDownloadUrl(id);
  const anchor = document.createElement("a");
  anchor.href = response.downloadUrl;
  anchor.target = action === "view" ? "_blank" : "_self";
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

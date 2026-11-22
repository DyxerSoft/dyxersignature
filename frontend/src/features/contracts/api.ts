import { apiRequest } from "../../services/api/client";
import type { ContractDetail } from "./types";

export type ContractListItem = {
  id: string;
  businessReference: string;
  baseDocumentId: string;
  status: string;
  currentVersionId: string | null;
  versionCount: number;
};

export function getContracts() {
  return apiRequest<ContractListItem[]>("/contracts");
}

export function contractVersionFileUrl(contractId: string, versionId: string, download = false) {
  const suffix = download ? "?download=true" : "";
  return `${import.meta.env.VITE_API_BASE_URL ?? "/api/v1"}/contracts/${contractId}/versions/${versionId}/file${suffix}`;
}

export async function createContract(businessReference: string, baseDocumentId: string) {
  return apiRequest<{ id: string; businessReference: string; status: string }>(
    "/contracts",
    {
      method: "POST",
      body: JSON.stringify({ businessReference, baseDocumentId })
    }
  );
}

export async function getContract(id: string) {
  return apiRequest<ContractDetail>(`/contracts/${id}`);
}

export async function uploadSignedVersion(
  contractId: string,
  file: File,
  changedBy: string,
  correctionReason?: string,
  changeSummary?: string
) {
  const form = new FormData();
  form.append("file", file);
  form.append("changedBy", changedBy);
  if (correctionReason) form.append("correctionReason", correctionReason);
  if (changeSummary) form.append("changeSummary", changeSummary);

  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL ?? "/api/v1"}/contracts/${contractId}/versions/signed`,
    {
      method: "POST",
      credentials: "include",
      body: form
    }
  );

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

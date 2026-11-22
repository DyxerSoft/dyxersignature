import { apiRequest } from "../../services/api/client";
import type { ContractDetail } from "./types";

export type ContractListItem = {
  id: string;
  businessReference: string;
  baseDocumentId?: string;
  status: string;
  currentVersionId: string | null;
  versionCount: number;
};

export function contractVersionFileUrl(contractId: string, versionId: string, download = false) {
  const suffix = download ? "?download=true" : "";
  return `${import.meta.env.VITE_API_BASE_URL ?? "/api/v1"}/contracts/${contractId}/versions/${versionId}/file${suffix}`;
}

export async function getContracts(): Promise<ContractListItem[]> {
  try {
    return await apiRequest<ContractListItem[]>("/contracts");
  } catch {
    // Si el backend aún no expone GET /contracts, devolvemos un array vacío seguro
    return [];
  }
}

export async function createContract(businessReference: string, baseDocumentId?: string) {
  const payload: Record<string, string> = { businessReference };
  if (baseDocumentId) payload.baseDocumentId = baseDocumentId;
  return apiRequest<{ id: string; businessReference: string; status: string }>(
    "/contracts",
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );
}

export async function getContract(id: string) {
  return apiRequest<ContractDetail>(`/contracts/${id}`);
}

export async function uploadSignedVersion(
  contractId: string,
  file: File,
  correctionReason?: string,
  changedBy?: string,
  changeSummary?: string
) {
  const form = new FormData();
  form.append("file", file);
  if (correctionReason) form.append("correctionReason", correctionReason);
  if (changedBy) form.append("changedBy", changedBy);
  if (changeSummary) form.append("changeSummary", changeSummary);

  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL ?? "/api/v1"}/contracts/${contractId}/versions/signed`,
    {
      method: "POST",
      credentials: "include",
      body: form
    }
  );

  if (!response.ok) {
    let errorMsg = `HTTP ${response.status}`;
    try {
      const errObj = await response.json();
      if (errObj?.detail) errorMsg = errObj.detail;
      else if (errObj?.title) errorMsg = errObj.title;
    } catch {}
    throw new Error(errorMsg);
  }
  return response.json() as Promise<unknown>;
}

export async function uploadScanForOcr(
  contractId: string,
  file: File,
  correctionReason?: string
) {
  const form = new FormData();
  form.append("file", file);
  if (correctionReason) form.append("correctionReason", correctionReason);

  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL ?? "/api/v1"}/contracts/${contractId}/ingest/scan`,
    {
      method: "POST",
      credentials: "include",
      body: form
    }
  );

  if (!response.ok) {
    let errorMsg = `HTTP ${response.status}`;
    try {
      const errObj = await response.json();
      if (errObj?.detail) errorMsg = errObj.detail;
      else if (errObj?.title) errorMsg = errObj.title;
    } catch {}
    throw new Error(errorMsg);
  }
  return response.json() as Promise<{
    contractId: string;
    digitizationJobId: string;
    status: string;
    fileName: string;
  }>;
}

export async function getDigitizationJob(contractId: string, jobId: string) {
  return apiRequest<import("./types").DigitizationJobDetail>(
    `/contracts/${contractId}/ingest/${jobId}`
  );
}

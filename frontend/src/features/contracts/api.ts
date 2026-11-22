import { apiRequest } from "../../services/api/client";
import type {
  ContractDetail,
  ContractListItem,
  ContractComparison,
  DashboardMetrics,
  DocumentVerification,
  Signer
} from "./types";

export function getDashboard() {
  return apiRequest<DashboardMetrics>("/dashboard");
}

export function listContracts() {
  return apiRequest<{ page: number; pageSize: number; total: number; items: ContractListItem[] }>(
    "/contracts?page=1&pageSize=100"
  );
}

export function createContract(businessReference: string, title: string) {
  return apiRequest<{ id: string; businessReference: string; title: string; status: string }>(
    "/contracts",
    {
      method: "POST",
      body: JSON.stringify({ businessReference, title })
    }
  );
}

export function getContract(id: string) {
  return apiRequest<ContractDetail>(`/contracts/${id}`);
}

export function uploadDraftVersion(contractId: string, file: File, correctionReason?: string) {
  const form = new FormData();
  form.append("file", file);
  if (correctionReason) form.append("correctionReason", correctionReason);
  return apiRequest<{ documentVersionId: string; versionNumber: number; documentHash: string }>(
    `/contracts/${contractId}/versions`,
    { method: "POST", body: form }
  );
}

export function reviewVersion(contractId: string, versionId: string, documentHash: string) {
  return apiRequest<void>(`/contracts/${contractId}/versions/${versionId}/review`, {
    method: "POST",
    body: JSON.stringify({ documentHash })
  });
}

export function signVersion(
  contractId: string,
  versionId: string,
  documentHash: string,
  signerName: string,
  signerEmail?: string
) {
  return apiRequest<{ documentVersionId: string; anchorStatus: string }>(
    `/contracts/${contractId}/versions/${versionId}/sign`,
    {
      method: "POST",
      body: JSON.stringify({ documentHash, signerName, signerEmail })
    }
  );
}

export function verifyVersion(contractId: string, versionId: string) {
  return apiRequest<DocumentVerification>(
    `/contracts/${contractId}/versions/${versionId}/verify`
  );
}

export function compareVersions(contractId: string, fromVersion: number, toVersion: number) {
  const query = new URLSearchParams({
    fromVersion: String(fromVersion),
    toVersion: String(toVersion)
  });
  return apiRequest<ContractComparison>(`/contracts/${contractId}/documents/compare?${query}`);
}

export function listSigners(contractId: string) {
  return apiRequest<{ contractId: string; signers: Signer[] }>(`/contracts/${contractId}/signatures`);
}

export function getDownloadUrl(versionId: string) {
  return apiRequest<{ downloadUrl: string; expiresAtUtc: string }>(
    `/documents/${versionId}/download`
  );
}


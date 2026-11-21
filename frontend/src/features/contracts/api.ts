import { apiRequest } from "../../services/api/client";
import type { ContractDetail } from "./types";

export async function createContract(businessReference: string) {
  return apiRequest<{ id: string; businessReference: string; status: string }>(
    "/contracts",
    {
      method: "POST",
      body: JSON.stringify({ businessReference })
    }
  );
}

export async function getContract(id: string) {
  return apiRequest<ContractDetail>(`/contracts/${id}`);
}

export async function uploadSignedVersion(
  contractId: string,
  file: File,
  correctionReason?: string
) {
  const form = new FormData();
  form.append("file", file);
  if (correctionReason) form.append("correctionReason", correctionReason);

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

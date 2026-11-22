import { apiRequest } from "../../services/api/client";
import { createContract as stellarCreate, getContract as stellarGet, listContracts, uploadDraftVersion } from "../stellar/api";
import type { ContractDetail } from "./types";

export type ContractListItem = {
  id: string;
  businessReference: string;
  title: string;
  baseDocumentId?: string;
  status: string;
  currentVersionId: string | null;
  versionCount: number;
};

/** Bridge from feat/front's list view to the real paginated Stellar API. */
export async function getContracts(): Promise<ContractListItem[]> {
  const page = await listContracts(1, 100);
  const contracts = page.items;
  const enriched = await Promise.all(contracts.map(async contract => {
    const detail = await stellarGet(contract.id);
    return {
      id: contract.id,
      businessReference: contract.businessReference,
      title: contract.title,
      status: contract.status,
      currentVersionId: contract.currentVersionId,
      versionCount: detail.versions.length
    };
  }));
  return enriched;
}

/** The Stellar API serves time-limited presigned URLs, not static /file endpoints. */
export function contractVersionFileUrl(_contractId: string, _versionId: string, _download = false) {
  return "#";
}

export async function createContract(businessReference: string, title: string) {
  return stellarCreate(businessReference, title);
}

type AuditEvent = {
  documentVersionId: string | null;
  eventType: string;
  actorType: string;
  actorId: string | null;
  occurredAtUtc: string;
  metadataJson: string;
};

export async function getContract(id: string): Promise<ContractDetail> {
  const [raw, audit] = await Promise.all([
    stellarGet(id),
    apiRequest<{ items: AuditEvent[] }>(`/contracts/${id}/audit?page=1&pageSize=100`)
  ]);
  return {
    id: raw.id,
    businessReference: raw.businessReference,
    baseDocumentId: "",
    status: raw.status,
    currentVersionId: raw.currentVersionId,
    versions: raw.versions.map(version => ({
      id: version.id,
      versionNumber: version.versionNumber,
      status: version.status,
      documentHash: version.documentHash,
      previousVersionId: version.previousVersionId,
      correctionReason: version.correctionReason,
      createdAtUtc: version.createdAtUtc,
      signedAtUtc: version.signedAtUtc,
      supersededAtUtc: version.supersededAtUtc,
      blockchain: version.blockchain ? {
        status: version.blockchain.status,
        chainId: null,
        transactionHash: version.blockchain.transactionHash,
        blockNumber: version.blockchain.ledgerNumber,
        retryCount: version.blockchain.retryCount,
        lastError: version.blockchain.lastError,
        confirmedAtUtc: version.blockchain.confirmedAtUtc
      } : null,
      traceability: audit.items.filter(event => event.documentVersionId === version.id).map(event => {
        let metadata: Record<string, unknown> = {};
        try { metadata = JSON.parse(event.metadataJson) as Record<string, unknown>; } catch { /* Audit metadata may be empty */ }
        return {
          eventType: event.eventType,
          actorType: event.actorType,
          actor: event.actorId,
          occurredAtUtc: event.occurredAtUtc,
          details: {
            fileName: typeof metadata.fileName === "string" ? metadata.fileName : undefined,
            changeSummary: typeof metadata.changeSummary === "string" ? metadata.changeSummary : undefined,
            correctionReason: typeof metadata.CorrectionReason === "string" ? metadata.CorrectionReason : null,
            versionNumber: typeof metadata.VersionNumber === "number" ? metadata.VersionNumber : undefined
          }
        };
      })
    }))
  };
}

/** Legacy workbench can upload drafts only; signature requires explicit review/sign calls. */
export async function uploadSignedVersion(
  contractId: string,
  file: File,
  _changedBy: string,
  correctionReason?: string,
  _changeSummary?: string
) {
  return uploadDraftVersion(contractId, file, correctionReason);
}

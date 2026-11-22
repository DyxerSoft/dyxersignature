export type BlockchainInfo = {
  status: string;
  chainId: number | null;
  transactionHash: string | null;
  blockNumber: number | null;
  retryCount: number;
  lastError: string | null;
  confirmedAtUtc: string | null;
};

export type ContractVersion = {
  id: string;
  versionNumber: number;
  status: string;
  documentHash: string | null;
  previousVersionId: string | null;
  correctionReason: string | null;
  createdAtUtc: string;
  signedAtUtc: string | null;
  supersededAtUtc: string | null;
  traceability?: {
    eventType: string;
    actorType: string;
    actor: string | null;
    occurredAtUtc: string;
    details: {
      fileName?: string;
      correctionReason?: string | null;
      changeSummary?: string | null;
      versionNumber?: number;
    };
  }[];
  blockchain: BlockchainInfo | null;
};

export type ContractDetail = {
  id: string;
  businessReference: string;
  baseDocumentId: string;
  status: string;
  currentVersionId: string | null;
  versions: ContractVersion[];
};

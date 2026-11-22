export type BlockchainInfo = {
  status: string;
  networkName: string | null;
  transactionHash: string | null;
  ledgerNumber: number | null;
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
  blockchain: BlockchainInfo | null;
};

export type ContractListItem = {
  id: string;
  businessReference: string;
  title: string;
  status: string;
  currentVersionId: string | null;
  createdAtUtc: string;
};

export type ContractDetail = {
  id: string;
  businessReference: string;
  title: string;
  status: string;
  currentVersionId: string | null;
  createdAtUtc: string;
  versions: ContractVersion[];
  signatures: Signer[];
};

export type Signer = {
  id: string;
  documentVersionId: string;
  signerName: string;
  signerEmail: string | null;
  documentHash: string;
  signedAtUtc: string;
};

export type DashboardMetrics = {
  generatedAtUtc: string;
  recentActivity?: {
    contractId: string;
    businessReference: string;
    title?: string;
    eventType: string;
    eventCount?: number;
    occurredAtUtc: string;
  }[];
  contracts: {
    total: number;
    active: number;
    byStatus: Record<string, number>;
  };
  documents: { versions: number };
  signatures: {
    total: number;
    thisMonth: number;
    averagePerContract: number;
    averageHoursToFirstSignature: number;
    frequency?: { one: number; two: number; three: number; four: number; fivePlus: number };
  };
  blockchain: {
    pending: number;
    confirmed?: number;
    failed?: number;
    retrying?: number;
    confirmedLastHour?: number;
    oldestPendingSeconds?: number;
  };
};

export type DocumentVerification = {
  id: string;
  versionNumber: number;
  expectedSha256: string;
  storedSha256: string;
  contentMatches: boolean;
  blockchain: {
    network: string;
    status: string;
    transactionHash: string | null;
    ledgerNumber: number | null;
    verified: boolean;
  };
  verified: boolean;
};

export type ContractComparison = {
  contractId: string;
  source: { versionNumber: number; documentHash: string | null; status: string; correctionReason: string | null };
  target: { versionNumber: number; documentHash: string | null; status: string; correctionReason: string | null };
  hashChanged: boolean;
  binaryDiffAvailable: boolean;
  comparison: string;
};


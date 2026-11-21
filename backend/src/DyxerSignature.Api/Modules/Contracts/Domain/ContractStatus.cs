namespace DyxerSignature.Api.Modules.Contracts.Domain;

public enum ContractStatus
{
    Draft,
    InSignature,
    Active,
    Cancelled,
    Closed
}

public enum DocumentVersionStatus
{
    Draft,
    ClientAccepted,
    GroupPazSignaturePending,
    Signed,
    BlockchainPending,
    BlockchainSubmitted,
    BlockchainConfirmed,
    Active,
    Superseded,
    Voided
}

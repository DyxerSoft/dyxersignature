namespace DyxerSignature.Api.Modules.Contracts.Domain;

public sealed class ContractDocumentVersion
{
    private ContractDocumentVersion() { }

    public ContractDocumentVersion(
        Guid contractId,
        int versionNumber,
        Guid? previousVersionId = null)
    {
        if (versionNumber <= 0)
            throw new ArgumentOutOfRangeException(nameof(versionNumber));

        Id = Guid.NewGuid();
        ContractId = contractId;
        VersionNumber = versionNumber;
        PreviousVersionId = previousVersionId;
        Status = DocumentVersionStatus.Draft;
        CreatedAtUtc = DateTimeOffset.UtcNow;
    }

    public Guid Id { get; private set; }
    public Guid ContractId { get; private set; }
    public int VersionNumber { get; private set; }
    public Guid? PreviousVersionId { get; private set; }
    public DocumentVersionStatus Status { get; private set; }
    public string? StorageKey { get; private set; }
    public string? DocumentHash { get; private set; }
    public string? CorrectionReason { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset? SignedAtUtc { get; private set; }
    public DateTimeOffset? SupersededAtUtc { get; private set; }

    public void MarkSigned(string storageKey, string documentHash, DateTimeOffset signedAtUtc)
    {
        if (Status is DocumentVersionStatus.Active or DocumentVersionStatus.Superseded)
            throw new InvalidOperationException("An immutable version cannot be re-signed.");

        StorageKey = storageKey;
        DocumentHash = documentHash;
        SignedAtUtc = signedAtUtc;
        Status = DocumentVersionStatus.Signed;
    }

    public void MarkBlockchainPending() => Status = DocumentVersionStatus.BlockchainPending;
    public void MarkBlockchainSubmitted() => Status = DocumentVersionStatus.BlockchainSubmitted;
    public void MarkBlockchainConfirmed() => Status = DocumentVersionStatus.BlockchainConfirmed;

    public void Activate()
    {
        if (Status != DocumentVersionStatus.BlockchainConfirmed)
            throw new InvalidOperationException("Only a blockchain-confirmed version can become active.");

        Status = DocumentVersionStatus.Active;
    }

    public void Supersede(string reason)
    {
        if (Status != DocumentVersionStatus.Active)
            throw new InvalidOperationException("Only the active version can be superseded.");

        CorrectionReason = reason;
        SupersededAtUtc = DateTimeOffset.UtcNow;
        Status = DocumentVersionStatus.Superseded;
    }
}

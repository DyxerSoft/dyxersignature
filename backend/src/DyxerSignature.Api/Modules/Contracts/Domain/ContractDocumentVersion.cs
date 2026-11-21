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

        if (string.IsNullOrWhiteSpace(storageKey))
            throw new ArgumentException("Storage key is required.", nameof(storageKey));

        if (documentHash.Length != 64)
            throw new ArgumentException("SHA-256 must contain 64 hexadecimal characters.", nameof(documentHash));

        StorageKey = storageKey;
        DocumentHash = documentHash.ToLowerInvariant();
        SignedAtUtc = signedAtUtc;
        Status = DocumentVersionStatus.Signed;
    }

    public void MarkBlockchainPending()
    {
        EnsureStatus(DocumentVersionStatus.Signed);
        Status = DocumentVersionStatus.BlockchainPending;
    }

    public void MarkBlockchainSubmitted()
    {
        if (Status is not (DocumentVersionStatus.BlockchainPending or DocumentVersionStatus.BlockchainSubmitted))
            throw new InvalidOperationException($"Cannot submit blockchain anchor from {Status}.");

        Status = DocumentVersionStatus.BlockchainSubmitted;
    }

    public void MarkBlockchainConfirmed()
    {
        if (Status is not (DocumentVersionStatus.BlockchainPending or DocumentVersionStatus.BlockchainSubmitted))
            throw new InvalidOperationException($"Cannot confirm blockchain anchor from {Status}.");

        Status = DocumentVersionStatus.BlockchainConfirmed;
    }

    public void Activate()
    {
        EnsureStatus(DocumentVersionStatus.BlockchainConfirmed);
        Status = DocumentVersionStatus.Active;
    }

    public void Supersede(string reason)
    {
        EnsureStatus(DocumentVersionStatus.Active);

        CorrectionReason = string.IsNullOrWhiteSpace(reason)
            ? "Replaced by a newer confirmed version."
            : reason.Trim();

        SupersededAtUtc = DateTimeOffset.UtcNow;
        Status = DocumentVersionStatus.Superseded;
    }

    private void EnsureStatus(DocumentVersionStatus expected)
    {
        if (Status != expected)
            throw new InvalidOperationException($"Expected status {expected} but found {Status}.");
    }
}

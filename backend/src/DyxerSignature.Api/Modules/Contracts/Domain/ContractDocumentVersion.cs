namespace DyxerSignature.Api.Modules.Contracts.Domain;

public sealed class ContractDocumentVersion
{
    private ContractDocumentVersion() { }

    public ContractDocumentVersion(
        Guid contractId,
        int versionNumber,
        Guid? previousVersionId = null,
        string? correctionReason = null)
    {
        if (versionNumber <= 0)
            throw new ArgumentOutOfRangeException(nameof(versionNumber));

        Id = Guid.NewGuid();
        ContractId = contractId;
        VersionNumber = versionNumber;
        PreviousVersionId = previousVersionId;
        if (correctionReason?.Length > 500)
            throw new ArgumentOutOfRangeException(nameof(correctionReason));
        CorrectionReason = string.IsNullOrWhiteSpace(correctionReason) ? null : correctionReason.Trim();
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

    public void AttachDraftDocument(string storageKey, string documentHash)
    {
        EnsureStatus(DocumentVersionStatus.Draft);
        if (StorageKey is not null || DocumentHash is not null)
            throw new InvalidOperationException("A document version can only be uploaded once.");

        if (string.IsNullOrWhiteSpace(storageKey))
            throw new ArgumentException("Storage key is required.", nameof(storageKey));

        if (!IsSha256(documentHash))
            throw new ArgumentException("SHA-256 must contain 64 hexadecimal characters.", nameof(documentHash));

        StorageKey = storageKey;
        DocumentHash = documentHash.ToLowerInvariant();
    }

    public void AcceptReview(string expectedDocumentHash)
    {
        EnsureStatus(DocumentVersionStatus.Draft);
        if (StorageKey is null || DocumentHash is null ||
            !StringComparer.OrdinalIgnoreCase.Equals(DocumentHash, expectedDocumentHash))
        {
            throw new InvalidOperationException("The reviewed hash does not match the uploaded immutable document.");
        }

        Status = DocumentVersionStatus.ClientAccepted;
    }

    public void MarkSigned(string expectedDocumentHash, DateTimeOffset signedAtUtc)
    {
        EnsureStatus(DocumentVersionStatus.ClientAccepted);
        if (DocumentHash is null ||
            !StringComparer.OrdinalIgnoreCase.Equals(DocumentHash, expectedDocumentHash))
        {
            throw new InvalidOperationException("The signed hash does not match the reviewed immutable document.");
        }

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

    public void Supersede()
    {
        EnsureStatus(DocumentVersionStatus.Active);
        SupersededAtUtc = DateTimeOffset.UtcNow;
        Status = DocumentVersionStatus.Superseded;
    }

    private static bool IsSha256(string? hash)
        => hash is { Length: 64 } && hash.All(Uri.IsHexDigit);

    private void EnsureStatus(DocumentVersionStatus expected)
    {
        if (Status != expected)
            throw new InvalidOperationException($"Expected status {expected} but found {Status}.");
    }
}


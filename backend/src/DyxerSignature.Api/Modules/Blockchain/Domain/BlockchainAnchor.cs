namespace DyxerSignature.Api.Modules.Blockchain.Domain;

public enum BlockchainAnchorStatus
{
    Pending,
    Prepared,
    Submitted,
    Confirmed,
    Failed
}

public sealed class BlockchainAnchor
{
    private BlockchainAnchor() { }

    public BlockchainAnchor(Guid documentVersionId, string documentHash, string evidenceHash)
    {
        if (!IsSha256(documentHash) || !IsSha256(evidenceHash))
            throw new ArgumentException("Document and evidence hashes must be SHA-256 hexadecimal values.");

        Id = Guid.NewGuid();
        DocumentVersionId = documentVersionId;
        DocumentHash = documentHash.ToLowerInvariant();
        EvidenceHash = evidenceHash.ToLowerInvariant();
        Status = BlockchainAnchorStatus.Pending;
        CreatedAtUtc = DateTimeOffset.UtcNow;
    }

    public Guid Id { get; private set; }
    public Guid DocumentVersionId { get; private set; }
    public string DocumentHash { get; private set; } = null!;
    public string EvidenceHash { get; private set; } = null!;
    public BlockchainAnchorStatus Status { get; private set; }
    public string? NetworkName { get; private set; }
    public string? TransactionHash { get; private set; }
    public long? LedgerNumber { get; private set; }
    public string? PreparedEnvelopeXdr { get; private set; }
    public int RetryCount { get; private set; }
    public string? LastError { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset? SubmittedAtUtc { get; private set; }
    public DateTimeOffset? ConfirmedAtUtc { get; private set; }

    public void MarkPrepared(string networkName, string transactionHash, string signedEnvelopeXdr)
    {
        if (string.IsNullOrWhiteSpace(networkName) ||
            string.IsNullOrWhiteSpace(signedEnvelopeXdr) ||
            !IsSha256(transactionHash))
        {
            throw new ArgumentException("Prepared transaction data is invalid.");
        }

        NetworkName = networkName;
        TransactionHash = transactionHash;
        PreparedEnvelopeXdr = signedEnvelopeXdr;
        Status = BlockchainAnchorStatus.Prepared;
    }

    public void MarkSubmitted(string networkName, string transactionHash)
    {
        NetworkName = networkName;
        TransactionHash = transactionHash;
        SubmittedAtUtc = DateTimeOffset.UtcNow;
        LastError = null;
        Status = BlockchainAnchorStatus.Submitted;
    }

    public void MarkConfirmed(string networkName, string transactionHash, long? ledgerNumber)
    {
        NetworkName = networkName;
        TransactionHash = transactionHash;
        LedgerNumber = ledgerNumber;
        PreparedEnvelopeXdr = null;
        ConfirmedAtUtc = DateTimeOffset.UtcNow;
        LastError = null;
        Status = BlockchainAnchorStatus.Confirmed;
    }

    public void RegisterFailure(string error)
    {
        RetryCount++;
        LastError = error.Length > 2000 ? error[..2000] : error;
        Status = BlockchainAnchorStatus.Failed;
    }

    public void PrepareRetry()
    {
        if (Status != BlockchainAnchorStatus.Confirmed)
            Status = PreparedEnvelopeXdr is null
                ? BlockchainAnchorStatus.Pending
                : BlockchainAnchorStatus.Prepared;
    }

    private static bool IsSha256(string? hash)
        => hash is { Length: 64 } && hash.All(Uri.IsHexDigit);
}

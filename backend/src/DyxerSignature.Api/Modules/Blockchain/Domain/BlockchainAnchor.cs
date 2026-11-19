namespace DyxerSignature.Api.Modules.Blockchain.Domain;

public enum BlockchainAnchorStatus
{
    Pending,
    Submitted,
    Confirmed,
    Failed
}

public sealed class BlockchainAnchor
{
    private BlockchainAnchor() { }

    public BlockchainAnchor(Guid documentVersionId, string documentHash, string evidenceHash)
    {
        if (documentHash.Length != 64 || evidenceHash.Length != 64)
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
    public long? ChainId { get; private set; }
    public string? TransactionHash { get; private set; }
    public long? BlockNumber { get; private set; }
    public int RetryCount { get; private set; }
    public string? LastError { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset? SubmittedAtUtc { get; private set; }
    public DateTimeOffset? ConfirmedAtUtc { get; private set; }

    public void MarkSubmitted(long chainId, string transactionHash)
    {
        ChainId = chainId;
        TransactionHash = transactionHash;
        SubmittedAtUtc = DateTimeOffset.UtcNow;
        LastError = null;
        Status = BlockchainAnchorStatus.Submitted;
    }

    public void MarkConfirmed(long chainId, long? blockNumber)
    {
        ChainId = chainId;
        BlockNumber = blockNumber;
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
            Status = BlockchainAnchorStatus.Pending;
    }
}

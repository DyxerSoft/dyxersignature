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
        Id = Guid.NewGuid();
        DocumentVersionId = documentVersionId;
        DocumentHash = documentHash;
        EvidenceHash = evidenceHash;
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
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset? SubmittedAtUtc { get; private set; }
    public DateTimeOffset? ConfirmedAtUtc { get; private set; }
}

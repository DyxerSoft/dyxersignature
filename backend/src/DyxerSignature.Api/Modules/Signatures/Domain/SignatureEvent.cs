namespace DyxerSignature.Api.Modules.Signatures.Domain;

/// <summary>
/// Append-only record of the person who submitted a definitive signed document.
/// It stores signer evidence in PostgreSQL and never puts personal data on-chain.
/// </summary>
public sealed class SignatureEvent
{
    private SignatureEvent() { }

    public SignatureEvent(
        Guid contractId,
        Guid documentVersionId,
        string signerName,
        string? signerEmail,
        string documentHash,
        string? ipAddress,
        string? userAgent)
    {
        if (string.IsNullOrWhiteSpace(signerName))
            throw new ArgumentException("Signer name is required.", nameof(signerName));
        if (documentHash.Length != 64)
            throw new ArgumentException("Document hash must be a SHA-256 value.", nameof(documentHash));

        Id = Guid.NewGuid();
        ContractId = contractId;
        DocumentVersionId = documentVersionId;
        SignerName = signerName.Trim();
        SignerEmail = string.IsNullOrWhiteSpace(signerEmail) ? null : signerEmail.Trim();
        DocumentHash = documentHash.ToLowerInvariant();
        IpAddress = ipAddress is null ? null : ipAddress[..Math.Min(64, ipAddress.Length)];
        UserAgent = userAgent is null ? null : userAgent[..Math.Min(500, userAgent.Length)];
        SignedAtUtc = DateTimeOffset.UtcNow;
    }

    public Guid Id { get; private set; }
    public Guid ContractId { get; private set; }
    public Guid DocumentVersionId { get; private set; }
    public string SignerName { get; private set; } = null!;
    public string? SignerEmail { get; private set; }
    public string DocumentHash { get; private set; } = null!;
    public string? IpAddress { get; private set; }
    public string? UserAgent { get; private set; }
    public DateTimeOffset SignedAtUtc { get; private set; }
}


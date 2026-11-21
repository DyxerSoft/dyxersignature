namespace DyxerSignature.Api.Modules.Evidence.Domain;

public sealed class EvidenceManifest
{
    private EvidenceManifest() { }

    public EvidenceManifest(Guid documentVersionId, string canonicalJson, string evidenceHash)
    {
        Id = Guid.NewGuid();
        DocumentVersionId = documentVersionId;
        CanonicalJson = canonicalJson;
        EvidenceHash = evidenceHash.ToLowerInvariant();
        CreatedAtUtc = DateTimeOffset.UtcNow;
    }

    public Guid Id { get; private set; }
    public Guid DocumentVersionId { get; private set; }
    public string CanonicalJson { get; private set; } = null!;
    public string EvidenceHash { get; private set; } = null!;
    public DateTimeOffset CreatedAtUtc { get; private set; }
}

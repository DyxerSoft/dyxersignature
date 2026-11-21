namespace DyxerSignature.Api.Modules.Contracts.Domain;

public sealed class Contract
{
    private Contract() { }

    public Contract(string businessReference)
    {
        if (string.IsNullOrWhiteSpace(businessReference))
            throw new ArgumentException("Business reference is required.", nameof(businessReference));

        Id = Guid.NewGuid();
        BusinessReference = businessReference.Trim();
        Status = ContractStatus.Draft;
        CreatedAtUtc = DateTimeOffset.UtcNow;
    }

    public Guid Id { get; private set; }
    public string BusinessReference { get; private set; } = null!;
    public ContractStatus Status { get; private set; }
    public Guid? CurrentVersionId { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }

    public void ActivateVersion(Guid versionId)
    {
        CurrentVersionId = versionId;
        Status = ContractStatus.Active;
        UpdatedAtUtc = DateTimeOffset.UtcNow;
    }
}

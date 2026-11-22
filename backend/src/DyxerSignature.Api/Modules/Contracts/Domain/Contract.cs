namespace DyxerSignature.Api.Modules.Contracts.Domain;

public sealed class Contract
{
    private Contract() { }

    public Contract(string businessReference, string title = "Contrato")
    {
        if (string.IsNullOrWhiteSpace(businessReference))
            throw new ArgumentException("Business reference is required.", nameof(businessReference));
        if (string.IsNullOrWhiteSpace(title))
            throw new ArgumentException("Title is required.", nameof(title));

        Id = Guid.NewGuid();
        BusinessReference = businessReference.Trim();
        Title = title.Trim();
        Status = ContractStatus.Draft;
        CreatedAtUtc = DateTimeOffset.UtcNow;
    }

    public Guid Id { get; private set; }
    public string BusinessReference { get; private set; } = null!;
    public string Title { get; private set; } = null!;
    public ContractStatus Status { get; private set; }
    public Guid? CurrentVersionId { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public DateTimeOffset? DeletedAtUtc { get; private set; }

    public void ActivateVersion(Guid versionId)
    {
        CurrentVersionId = versionId;
        Status = ContractStatus.Active;
        UpdatedAtUtc = DateTimeOffset.UtcNow;
    }

    public void UpdateTitle(string title)
    {
        if (string.IsNullOrWhiteSpace(title))
            throw new ArgumentException("Title is required.", nameof(title));

        Title = title.Trim();
        UpdatedAtUtc = DateTimeOffset.UtcNow;
    }

    public void MarkSignatureInProgress()
    {
        if (CurrentVersionId is null)
            Status = ContractStatus.InSignature;
        UpdatedAtUtc = DateTimeOffset.UtcNow;
    }

    public void SoftDelete()
    {
        DeletedAtUtc ??= DateTimeOffset.UtcNow;
        UpdatedAtUtc = DateTimeOffset.UtcNow;
    }
}


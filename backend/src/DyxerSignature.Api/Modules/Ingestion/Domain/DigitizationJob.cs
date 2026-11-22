namespace DyxerSignature.Api.Modules.Ingestion.Domain;

public enum DigitizationStatus
{
    Pending,
    Processing,
    Completed,
    Failed
}

public sealed class DigitizationJob
{
    public Guid Id { get; private set; }
    public Guid ContractId { get; private set; }
    public DigitizationStatus Status { get; private set; }
    public string FileName { get; private set; } = string.Empty;
    public string StorageKey { get; private set; } = string.Empty;
    public double ConfidenceScore { get; private set; }
    public bool RequiresReview { get; private set; }
    public string? ExtractedTextSummary { get; private set; }
    public Guid? GeneratedDocumentVersionId { get; private set; }
    public string? ErrorMessage { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset? CompletedAtUtc { get; private set; }

    public ICollection<DigitizationSignatureCrop> Signatures { get; private set; } = new List<DigitizationSignatureCrop>();

    private DigitizationJob() { }

    public DigitizationJob(Guid contractId, string fileName, string storageKey)
    {
        Id = Guid.NewGuid();
        ContractId = contractId;
        FileName = fileName;
        StorageKey = storageKey;
        Status = DigitizationStatus.Pending;
        CreatedAtUtc = DateTimeOffset.UtcNow;
    }

    public void MarkProcessing()
    {
        Status = DigitizationStatus.Processing;
    }

    public void SetStorageKey(string storageKey)
    {
        StorageKey = storageKey;
    }

    public void MarkCompleted(
        double confidenceScore,
        bool requiresReview,
        string? extractedTextSummary,
        Guid generatedDocumentVersionId)
    {
        Status = DigitizationStatus.Completed;
        ConfidenceScore = confidenceScore;
        RequiresReview = requiresReview;
        ExtractedTextSummary = extractedTextSummary;
        GeneratedDocumentVersionId = generatedDocumentVersionId;
        CompletedAtUtc = DateTimeOffset.UtcNow;
    }

    public void MarkFailed(string errorMessage)
    {
        Status = DigitizationStatus.Failed;
        ErrorMessage = errorMessage;
        CompletedAtUtc = DateTimeOffset.UtcNow;
    }
}

namespace DyxerSignature.Api.Modules.Ingestion.Domain;

public sealed class DigitizationSignatureCrop
{
    public Guid Id { get; private set; }
    public Guid DigitizationJobId { get; private set; }
    public int PageNumber { get; private set; }
    public string BoundingBoxJson { get; private set; } = string.Empty;
    public double Confidence { get; private set; }
    public string CropStorageKey { get; private set; } = string.Empty;
    public DateTimeOffset CreatedAtUtc { get; private set; }

    private DigitizationSignatureCrop() { }

    public DigitizationSignatureCrop(
        Guid digitizationJobId,
        int pageNumber,
        string boundingBoxJson,
        double confidence,
        string cropStorageKey)
    {
        Id = Guid.NewGuid();
        DigitizationJobId = digitizationJobId;
        PageNumber = pageNumber;
        BoundingBoxJson = boundingBoxJson;
        Confidence = confidence;
        CropStorageKey = cropStorageKey;
        CreatedAtUtc = DateTimeOffset.UtcNow;
    }
}

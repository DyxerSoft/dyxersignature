namespace DyxerSignature.Api.Modules.Ingestion.Application;

public sealed class IngestionOptions
{
    public double ConfidenceThreshold { get; init; } = 0.85;
    public string Mode { get; init; } = "Http";
    public string ServiceUrl { get; init; } = "http://ocr:8000";
}

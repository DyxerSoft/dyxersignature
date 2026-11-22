namespace DyxerSignature.Api.Modules.Ingestion.Application;

public record OcrExtractionResult(
    bool Success,
    int TotalPages,
    double AverageConfidence,
    string RawText,
    IReadOnlyList<OcrTextBlockDto> Blocks,
    IReadOnlyList<DetectedSignatureDto> Signatures,
    string Engine);

public record OcrTextBlockDto(
    string Text,
    double Confidence,
    int[][] Box);

public record DetectedSignatureDto(
    string SignatureId,
    int PageNumber,
    SignatureBoundingBoxDto Box,
    double Confidence,
    string ImageBase64);

public record SignatureBoundingBoxDto(
    int X1, int Y1, int X2, int Y2);

public interface IOcrEngineGateway
{
    Task<OcrExtractionResult> ExtractAsync(
        Stream fileStream,
        string fileName,
        string contentType,
        CancellationToken cancellationToken);
}

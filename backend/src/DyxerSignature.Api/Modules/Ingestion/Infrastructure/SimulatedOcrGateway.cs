namespace DyxerSignature.Api.Modules.Ingestion.Infrastructure;

using DyxerSignature.Api.Modules.Ingestion.Application;

public sealed class SimulatedOcrGateway : IOcrEngineGateway
{
    public Task<OcrExtractionResult> ExtractAsync(
        Stream fileStream,
        string fileName,
        string contentType,
        CancellationToken cancellationToken)
    {
        var blocks = new List<OcrTextBlockDto>
        {
            new("CONTRATO DE SERVICIOS DIGITALES GRUPO PAZ", 0.98, [[10, 10], [200, 10], [200, 30], [10, 30]]),
            new("El presente documento certifica la validez legal y técnica.", 0.95, [[10, 40], [300, 40], [300, 60], [10, 60]]),
            new("Firma del Cliente: ________________________", 0.92, [[10, 100], [250, 100], [250, 120], [10, 120]])
        };

        const string dummyPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

        var signatures = new List<DetectedSignatureDto>
        {
            new(Guid.NewGuid().ToString("N"), 1, new SignatureBoundingBoxDto(10, 80, 250, 130), 0.92, dummyPngBase64)
        };

        var result = new OcrExtractionResult(
            Success: true,
            TotalPages: 1,
            AverageConfidence: 0.95,
            RawText: "CONTRATO DE SERVICIOS DIGITALES GRUPO PAZ\nEl presente documento certifica la validez legal y técnica.\nFirma del Cliente",
            Blocks: blocks,
            Signatures: signatures,
            Engine: "SimulatedOCR");

        return Task.FromResult(result);
    }
}

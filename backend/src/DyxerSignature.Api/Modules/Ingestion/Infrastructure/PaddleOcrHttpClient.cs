using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace DyxerSignature.Api.Modules.Ingestion.Infrastructure;

using DyxerSignature.Api.Modules.Ingestion.Application;

public sealed class PaddleOcrHttpClient(
    HttpClient httpClient,
    IOptions<IngestionOptions> options) : IOcrEngineGateway
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
    };

    public async Task<OcrExtractionResult> ExtractAsync(
        Stream fileStream,
        string fileName,
        string contentType,
        CancellationToken cancellationToken)
    {
        var targetUrl = $"{options.Value.ServiceUrl.TrimEnd('/')}/api/v1/ocr/extract";

        using var content = new MultipartFormDataContent();
        using var streamContent = new StreamContent(fileStream);
        streamContent.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        content.Add(streamContent, "file", fileName);

        using var response = await httpClient.PostAsync(targetUrl, content, cancellationToken);
        response.EnsureSuccessStatusCode();

        await using var responseStream = await response.Content.ReadAsStreamAsync(cancellationToken);
        var result = await JsonSerializer.DeserializeAsync<OcrExtractionResult>(responseStream, JsonOptions, cancellationToken);

        return result ?? throw new InvalidOperationException("Respuesta nula del motor PaddleOCR.");
    }
}

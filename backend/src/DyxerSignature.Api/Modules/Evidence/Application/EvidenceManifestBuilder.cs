using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using DyxerSignature.Api.Modules.Contracts.Domain;
using DyxerSignature.Api.Modules.Evidence.Domain;

namespace DyxerSignature.Api.Modules.Evidence.Application;

public sealed class EvidenceManifestBuilder
{
    private static readonly JsonWriterOptions WriterOptions = new()
    {
        Indented = false,
        SkipValidation = false
    };

    public EvidenceManifest Build(
        Contract contract,
        ContractDocumentVersion version,
        string? previousDocumentHash,
        string? ocrEngine = null,
        int? detectedSignaturesCount = null)
    {
        if (version.DocumentHash is null || version.SignedAtUtc is null)
            throw new InvalidOperationException("The document version must be signed before evidence is generated.");

        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream, WriterOptions))
        {
            writer.WriteStartObject();
            writer.WriteString("schemaVersion", "1.0");
            writer.WriteString("contractId", contract.Id);
            writer.WriteString("businessReference", contract.BusinessReference);
            writer.WriteString("documentVersionId", version.Id);
            writer.WriteNumber("versionNumber", version.VersionNumber);
            writer.WriteString("documentSha256", version.DocumentHash);
            writer.WriteString("signedAtUtc", version.SignedAtUtc.Value.UtcDateTime);
            if (!string.IsNullOrWhiteSpace(previousDocumentHash))
                writer.WriteString("previousDocumentSha256", previousDocumentHash);
            else
                writer.WriteNull("previousDocumentSha256");

            if (!string.IsNullOrWhiteSpace(ocrEngine))
            {
                writer.WriteString("ocrEngine", ocrEngine);
                writer.WriteNumber("detectedSignaturesCount", detectedSignaturesCount ?? 0);
            }

            writer.WriteEndObject();
        }

        var bytes = stream.ToArray();
        var canonicalJson = Encoding.UTF8.GetString(bytes);
        var evidenceHash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

        return new EvidenceManifest(version.Id, canonicalJson, evidenceHash);
    }
}

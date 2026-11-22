using System.Text;
using System.Text.Json;
using DyxerSignature.Api.Infrastructure.Outbox;
using DyxerSignature.Api.Infrastructure.Persistence;
using DyxerSignature.Api.Modules.Audit.Domain;
using DyxerSignature.Api.Modules.Blockchain.Application;
using DyxerSignature.Api.Modules.Blockchain.Domain;
using DyxerSignature.Api.Modules.Contracts.Domain;
using DyxerSignature.Api.Modules.Documents.Application;
using DyxerSignature.Api.Modules.Evidence.Application;
using DyxerSignature.Api.Modules.Ingestion.Application;
using DyxerSignature.Api.Modules.Ingestion.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace DyxerSignature.Api.Modules.Ingestion.Application;

public sealed class DigitizationService(
    AppDbContext db,
    IOcrEngineGateway ocrGateway,
    IDocumentStorage documentStorage,
    DocumentIntegrityService documentIntegrity,
    EvidenceManifestBuilder evidenceBuilder,
    IOptions<IngestionOptions> ingestionOptions,
    ILogger<DigitizationService> logger)
{
    private readonly IngestionOptions _options = ingestionOptions.Value;

    public async Task<DigitizationJob> ProcessScanAsync(
        Guid contractId,
        Stream fileStream,
        string fileName,
        string contentType,
        string? correctionReason,
        CancellationToken cancellationToken)
    {
        var contract = await db.Contracts.SingleOrDefaultAsync(x => x.Id == contractId, cancellationToken)
            ?? throw new KeyNotFoundException($"Contrato {contractId} no encontrado.");

        using var memoryStream = new MemoryStream();
        await fileStream.CopyToAsync(memoryStream, cancellationToken);
        var inputBytes = memoryStream.ToArray();

        var job = new DigitizationJob(contractId, fileName, "pending_storage");
        job.MarkProcessing();
        db.DigitizationJobs.Add(job);

        memoryStream.Position = 0;
        var scanStorageKey = await documentStorage.SaveScanAsync(
            contractId,
            job.Id,
            fileName,
            memoryStream,
            cancellationToken);
        job.SetStorageKey(scanStorageKey);

        await db.SaveChangesAsync(cancellationToken);

        try
        {
            logger.LogInformation("Iniciando extracción OCR para el job {JobId} ({FileName}).", job.Id, fileName);
            using var ocrStream = new MemoryStream(inputBytes);
            var ocrResult = await ocrGateway.ExtractAsync(ocrStream, fileName, contentType, cancellationToken);

            logger.LogInformation(
                "OCR completado para job {JobId}: Confianza promedio {AvgConf}, {SigCount} firmas detectadas.",
                job.Id,
                ocrResult.AverageConfidence,
                ocrResult.Signatures.Count);

            foreach (var sig in ocrResult.Signatures)
            {
                try
                {
                    var sigBytes = Convert.FromBase64String(sig.ImageBase64);
                    using var cropStream = new MemoryStream(sigBytes);
                    var cropStorageKey = await documentStorage.SaveSignatureCropAsync(
                        contract.Id,
                        job.Id,
                        $"sig_p{sig.PageNumber}_{Guid.NewGuid():N}.png",
                        cropStream,
                        cancellationToken);

                    var boxJson = JsonSerializer.Serialize(sig.Box);
                    var cropEntity = new DigitizationSignatureCrop(
                        job.Id,
                        sig.PageNumber,
                        boxJson,
                        sig.Confidence,
                        cropStorageKey);

                    db.DigitizationSignatureCrops.Add(cropEntity);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "No se pudo guardar recorte de firma para job {JobId}.", job.Id);
                }
            }

            var nextVersionNumber = (await db.ContractDocumentVersions
                .Where(x => x.ContractId == contract.Id)
                .Select(x => (int?)x.VersionNumber)
                .MaxAsync(cancellationToken) ?? 0) + 1;

            var previousActive = contract.CurrentVersionId is Guid currentVersionId
                ? await db.ContractDocumentVersions.SingleOrDefaultAsync(x => x.Id == currentVersionId, cancellationToken)
                : null;

            var pdfBytes = EnsurePdfBytes(inputBytes, ocrResult.RawText, contract.Id);
            using var pdfStream = new MemoryStream(pdfBytes);

            var storageKey = await documentStorage.SaveSignedPdfAsync(
                contract.Id,
                nextVersionNumber,
                pdfStream,
                cancellationToken);

            pdfStream.Position = 0;
            var documentHash = await documentIntegrity.ComputeSha256Async(pdfStream, cancellationToken);

            var existingAnchor = await db.BlockchainAnchors
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.DocumentHash == documentHash, cancellationToken);

            if (existingAnchor != null)
            {
                var existingVersion = await db.ContractDocumentVersions
                    .AsNoTracking()
                    .FirstOrDefaultAsync(x => x.Id == existingAnchor.DocumentVersionId, cancellationToken);

                var existingContract = existingVersion != null
                    ? await db.Contracts.AsNoTracking().FirstOrDefaultAsync(x => x.Id == existingVersion.ContractId, cancellationToken)
                    : null;

                var contractRef = existingContract != null ? existingContract.BusinessReference : existingAnchor.DocumentVersionId.ToString();

                throw new InvalidOperationException(
                    $"El documento escaneado ya fue anclado previamente en blockchain para el contrato '{contractRef}' (Hash SHA-256: {documentHash[..12]}...). Por integridad e inmutabilidad criptográfica, el mismo archivo no puede ser registrado en contratos distintos.");
            }

            var signedAtUtc = DateTimeOffset.UtcNow;

            var version = new ContractDocumentVersion(
                contract.Id,
                nextVersionNumber,
                previousActive?.Id);

            version.MarkSigned(storageKey, documentHash, signedAtUtc);
            version.MarkBlockchainPending();

            var evidence = evidenceBuilder.Build(
                contract,
                version,
                previousActive?.DocumentHash,
                ocrResult.Engine,
                ocrResult.Signatures.Count);

            var anchor = new BlockchainAnchor(
                version.Id,
                documentHash,
                evidence.EvidenceHash);

            var payload = new AnchorDocumentOutboxPayload(
                anchor.Id,
                contract.Id,
                version.Id,
                correctionReason ?? $"Digitalizado por {ocrResult.Engine}");

            db.ContractDocumentVersions.Add(version);
            db.EvidenceManifests.Add(evidence);
            db.BlockchainAnchors.Add(anchor);
            db.OutboxMessages.Add(new OutboxMessage(
                BlockchainOutboxWorker.AnchorDocumentType,
                JsonSerializer.Serialize(payload)));

            var requiresReview = ocrResult.AverageConfidence < _options.ConfidenceThreshold;
            var textSummary = ocrResult.RawText.Length > 500
                ? ocrResult.RawText[..500] + "..."
                : ocrResult.RawText;

            job.MarkCompleted(
                ocrResult.AverageConfidence,
                requiresReview,
                textSummary,
                version.Id);

            db.AuditEvents.Add(new AuditEvent(
                contract.Id,
                version.Id,
                "DOCUMENT_SCANNED_AND_DIGITIZED",
                "SYSTEM",
                "OCR_PIPELINE",
                JsonSerializer.Serialize(new
                {
                    job.Id,
                    ocrResult.Engine,
                    ocrResult.AverageConfidence,
                    requiresReview,
                    signaturesCount = ocrResult.Signatures.Count,
                    versionNumber = version.VersionNumber,
                    documentHash
                }),
                Guid.NewGuid()));

            await db.SaveChangesAsync(cancellationToken);
            return job;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error durante digitalización de job {JobId}.", job.Id);

            foreach (var entry in db.ChangeTracker.Entries().ToList())
            {
                if (!ReferenceEquals(entry.Entity, job))
                {
                    entry.State = EntityState.Detached;
                }
            }

            job.MarkFailed(ex.Message);
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (Exception saveEx)
            {
                logger.LogError(saveEx, "No se pudo persistir el estado de fallo del job {JobId}.", job.Id);
            }

            throw;
        }
    }

    private static byte[] EnsurePdfBytes(byte[] inputBytes, string rawText, Guid contractId)
    {
        if (inputBytes.Length >= 4 && inputBytes[0] == '%' && inputBytes[1] == 'P' && inputBytes[2] == 'D' && inputBytes[3] == 'F')
        {
            return inputBytes;
        }

        using var ms = new MemoryStream();
        using var writer = new StreamWriter(ms, Encoding.ASCII, leaveOpen: true);

        var text = rawText ?? string.Empty;
        var cleanText = new string(text.Where(c => c >= 32 && c <= 126).ToArray());
        if (cleanText.Length > 150) cleanText = cleanText[..150] + "...";
        if (string.IsNullOrWhiteSpace(cleanText)) cleanText = "Documento Digitalizado - Grupo Paz";

        var header = $"Contrato: {contractId:N} | Emision: {DateTimeOffset.UtcNow:yyyyMMddHHmmss}Z";
        var contentStream = $"BT /F1 10 Tf 50 750 Td ({header}) Tj 0 -20 Td ({cleanText}) Tj ET";
        var contentBytes = Encoding.ASCII.GetBytes(contentStream);

        writer.Write("%PDF-1.4\n");
        writer.Flush();
        var obj1Offset = ms.Position;
        writer.Write("1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n");
        writer.Flush();
        var obj2Offset = ms.Position;
        writer.Write("2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n");
        writer.Flush();
        var obj3Offset = ms.Position;
        writer.Write("3 0 obj\n<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>\nendobj\n");
        writer.Flush();
        var obj4Offset = ms.Position;
        writer.Write("4 0 obj\n<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>\nendobj\n");
        writer.Flush();
        var obj5Offset = ms.Position;
        writer.Write($"5 0 obj\n<</Length {contentBytes.Length}>>\nstream\n{contentStream}\nendstream\nendobj\n");
        writer.Flush();
        var xrefOffset = ms.Position;
        writer.Write("xref\n0 6\n0000000000 65535 f \n");
        writer.Write($"{obj1Offset:D10} 00000 n \n");
        writer.Write($"{obj2Offset:D10} 00000 n \n");
        writer.Write($"{obj3Offset:D10} 00000 n \n");
        writer.Write($"{obj4Offset:D10} 00000 n \n");
        writer.Write($"{obj5Offset:D10} 00000 n \n");
        writer.Write($"trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n{xrefOffset}\n%%EOF\n");
        writer.Flush();

        return ms.ToArray();
    }
}

using DyxerSignature.Api.Infrastructure.Persistence;
using DyxerSignature.Api.Modules.Documents.Application;
using DyxerSignature.Api.Modules.Ingestion.Application;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DyxerSignature.Api.Modules.Ingestion.Api;

[ApiController]
[Route("api/v1/contracts/{id:guid}/ingest")]
public sealed class IngestionController(
    AppDbContext db,
    DigitizationService digitizationService,
    IDocumentStorage documentStorage) : ControllerBase
{
    [HttpPost("scan")]
    [RequestSizeLimit(35_000_000)]
    public async Task<ActionResult<object>> UploadScan(
        Guid id,
        [FromForm] IFormFile file,
        [FromForm] string? correctionReason,
        CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
            return ValidationProblem("Un archivo escaneado o imagen es requerido.");

        var allowedMimes = new[] { "application/pdf", "image/png", "image/jpeg", "image/jpg" };
        var isAllowed = allowedMimes.Any(m => m.Equals(file.ContentType, StringComparison.OrdinalIgnoreCase))
            || file.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)
            || file.FileName.EndsWith(".png", StringComparison.OrdinalIgnoreCase)
            || file.FileName.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase)
            || file.FileName.EndsWith(".jpeg", StringComparison.OrdinalIgnoreCase);

        if (!isAllowed)
            return ValidationProblem("Formato no soportado. Se admiten archivos PDF, PNG y JPEG.");

        try
        {
            await using var uploadStream = file.OpenReadStream();
            var job = await digitizationService.ProcessScanAsync(
                id,
                uploadStream,
                file.FileName,
                file.ContentType,
                correctionReason,
                cancellationToken);

            return AcceptedAtAction(
                nameof(GetJobStatus),
                new { id, jobId = job.Id },
                new
                {
                    contractId = id,
                    digitizationJobId = job.Id,
                    status = job.Status.ToString(),
                    fileName = job.FileName
                });
        }
        catch (InvalidOperationException ex)
        {
            return Problem(
                detail: ex.Message,
                statusCode: StatusCodes.Status409Conflict,
                title: "Documento duplicado");
        }
    }

    [HttpGet("{jobId:guid}")]
    public async Task<ActionResult<object>> GetJobStatus(
        Guid id,
        Guid jobId,
        CancellationToken cancellationToken)
    {
        var job = await db.DigitizationJobs
            .Include(x => x.Signatures)
            .SingleOrDefaultAsync(x => x.Id == jobId && x.ContractId == id, cancellationToken);

        if (job is null)
            return NotFound();

        var version = job.GeneratedDocumentVersionId is Guid versionId
            ? await db.ContractDocumentVersions
                .SingleOrDefaultAsync(x => x.Id == versionId, cancellationToken)
            : null;

        var anchor = version is not null
            ? await db.BlockchainAnchors
                .SingleOrDefaultAsync(x => x.DocumentVersionId == version.Id, cancellationToken)
            : null;

        return Ok(new
        {
            digitizationJobId = job.Id,
            status = job.Status.ToString(),
            errorMessage = job.ErrorMessage,
            confidenceScore = job.ConfidenceScore,
            requiresReview = job.RequiresReview,
            extractedTextSummary = job.ExtractedTextSummary,
            signaturesDetected = job.Signatures.Select(s => new
            {
                id = s.Id,
                pageNumber = s.PageNumber,
                boundingBox = s.BoundingBoxJson,
                confidence = s.Confidence,
                cropStorageKey = s.CropStorageKey
            }),
            generatedDocumentVersionId = job.GeneratedDocumentVersionId,
            documentHash = version?.DocumentHash,
            versionStatus = version?.Status.ToString(),
            blockchain = anchor is null ? null : new
            {
                status = anchor.Status.ToString(),
                transactionHash = anchor.TransactionHash,
                blockNumber = anchor.BlockNumber
            }
        });
    }

    [HttpGet("{jobId:guid}/signatures/{cropId:guid}/file")]
    public async Task<IActionResult> GetSignatureCropFile(
        Guid id,
        Guid jobId,
        Guid cropId,
        CancellationToken cancellationToken)
    {
        var crop = await db.DigitizationSignatureCrops
            .SingleOrDefaultAsync(x => x.Id == cropId && x.DigitizationJobId == jobId, cancellationToken);

        if (crop is null)
            return NotFound();

        var stream = await documentStorage.OpenReadAsync(crop.CropStorageKey, cancellationToken);
        return File(stream, "image/png");
    }

    [HttpGet("{jobId:guid}/file")]
    public async Task<IActionResult> GetJobScanFile(
        Guid id,
        Guid jobId,
        CancellationToken cancellationToken)
    {
        var job = await db.DigitizationJobs.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == jobId && x.ContractId == id, cancellationToken);

        if (job is null || string.IsNullOrWhiteSpace(job.StorageKey))
            return NotFound();

        var stream = await documentStorage.OpenReadAsync(job.StorageKey, cancellationToken);
        var mime = job.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase) ? "application/pdf" :
                   job.FileName.EndsWith(".png", StringComparison.OrdinalIgnoreCase) ? "image/png" : "image/jpeg";

        return File(stream, mime);
    }
}

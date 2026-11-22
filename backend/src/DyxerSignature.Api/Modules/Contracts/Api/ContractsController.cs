using System.Text.Json;
using DyxerSignature.Api.Infrastructure.Outbox;
using DyxerSignature.Api.Infrastructure.Persistence;
using DyxerSignature.Api.Modules.Audit.Domain;
using DyxerSignature.Api.Modules.Blockchain.Application;
using DyxerSignature.Api.Modules.Blockchain.Domain;
using DyxerSignature.Api.Modules.Contracts.Domain;
using DyxerSignature.Api.Modules.Documents.Application;
using DyxerSignature.Api.Modules.Evidence.Application;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DyxerSignature.Api.Modules.Contracts.Api;

[ApiController]
[Route("api/v1/contracts")]
public sealed class ContractsController(
    AppDbContext db,
    IDocumentStorage documentStorage,
    DocumentIntegrityService documentIntegrity,
    EvidenceManifestBuilder evidenceBuilder) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<object>> Create(
        CreateContractRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.BusinessReference))
            return ValidationProblem("businessReference is required.");

        var contract = new Contract(request.BusinessReference);
        db.Contracts.Add(contract);
        db.AuditEvents.Add(new AuditEvent(
            contract.Id,
            null,
            "CONTRACT_CREATED",
            "USER",
            User.Identity?.Name,
            "{}",
            HttpContext.TraceIdentifierToGuid()));

        await db.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(
            nameof(GetById),
            new { id = contract.Id },
            new
            {
                contract.Id,
                contract.BusinessReference,
                status = contract.Status.ToString()
            });
    }

    [HttpPost("{id:guid}/versions/signed")]
    [RequestSizeLimit(25_000_000)]
    public async Task<ActionResult<object>> AddSignedVersion(
        Guid id,
        [FromForm] IFormFile file,
        [FromForm] string? correctionReason,
        CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
            return ValidationProblem("A signed PDF file is required.");

        var contract = await db.Contracts.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (contract is null)
            return NotFound();

        var nextVersion = (await db.ContractDocumentVersions
            .Where(x => x.ContractId == id)
            .Select(x => (int?)x.VersionNumber)
            .MaxAsync(cancellationToken) ?? 0) + 1;

        var previousActive = contract.CurrentVersionId is Guid currentVersionId
            ? await db.ContractDocumentVersions
                .SingleOrDefaultAsync(x => x.Id == currentVersionId, cancellationToken)
            : null;

        await using var upload = file.OpenReadStream();
        var storageKey = await documentStorage.SaveSignedPdfAsync(
            contract.Id,
            nextVersion,
            upload,
            cancellationToken);

        try
        {
            await using var validationStream = await documentStorage.OpenReadAsync(storageKey, cancellationToken);
            if (!await documentIntegrity.IsPdfAsync(validationStream, cancellationToken))
            {
                await documentStorage.DeleteAsync(storageKey, cancellationToken);
                return ValidationProblem("The uploaded file is not a valid PDF stream.");
            }

            await using var hashStream = await documentStorage.OpenReadAsync(storageKey, cancellationToken);
            var documentHash = await documentIntegrity.ComputeSha256Async(hashStream, cancellationToken);

            var existingAnchor = await db.BlockchainAnchors
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.DocumentHash == documentHash, cancellationToken);

            if (existingAnchor != null)
            {
                await documentStorage.DeleteAsync(storageKey, cancellationToken);

                var existingVersion = await db.ContractDocumentVersions
                    .AsNoTracking()
                    .FirstOrDefaultAsync(x => x.Id == existingAnchor.DocumentVersionId, cancellationToken);

                var existingContract = existingVersion != null
                    ? await db.Contracts.AsNoTracking().FirstOrDefaultAsync(x => x.Id == existingVersion.ContractId, cancellationToken)
                    : null;

                var contractRef = existingContract != null ? existingContract.BusinessReference : existingAnchor.DocumentVersionId.ToString();

                return Problem(
                    detail: $"El documento ya fue anclado previamente en blockchain para el contrato '{contractRef}' (Hash SHA-256: {documentHash[..12]}...). Por integridad e inmutabilidad criptográfica, el mismo archivo no puede ser registrado en contratos distintos.",
                    statusCode: StatusCodes.Status409Conflict,
                    title: "Documento duplicado");
            }

            var signedAtUtc = DateTimeOffset.UtcNow;

            var version = new ContractDocumentVersion(
                contract.Id,
                nextVersion,
                previousActive?.Id);

            version.MarkSigned(storageKey, documentHash, signedAtUtc);
            version.MarkBlockchainPending();

            var evidence = evidenceBuilder.Build(
                contract,
                version,
                previousActive?.DocumentHash);

            var anchor = new BlockchainAnchor(
                version.Id,
                documentHash,
                evidence.EvidenceHash);

            var payload = new AnchorDocumentOutboxPayload(
                anchor.Id,
                contract.Id,
                version.Id,
                correctionReason);

            db.ContractDocumentVersions.Add(version);
            db.EvidenceManifests.Add(evidence);
            db.BlockchainAnchors.Add(anchor);
            db.OutboxMessages.Add(new OutboxMessage(
                BlockchainOutboxWorker.AnchorDocumentType,
                JsonSerializer.Serialize(payload)));

            db.AuditEvents.Add(new AuditEvent(
                contract.Id,
                version.Id,
                "SIGNED_DOCUMENT_VERSION_RECEIVED",
                "USER",
                User.Identity?.Name,
                JsonSerializer.Serialize(new
                {
                    version.VersionNumber,
                    version.DocumentHash,
                    file.FileName,
                    file.Length
                }),
                HttpContext.TraceIdentifierToGuid()));

            await db.SaveChangesAsync(cancellationToken);

            return AcceptedAtAction(
                nameof(GetById),
                new { id = contract.Id },
                new
                {
                    contract.Id,
                    documentVersionId = version.Id,
                    versionNumber = version.VersionNumber,
                    documentHash,
                    evidenceHash = evidence.EvidenceHash,
                    status = version.Status.ToString()
                });
        }
        catch
        {
            await documentStorage.DeleteAsync(storageKey, cancellationToken);
            throw;
        }
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<object>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var contract = await db.Contracts.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == id, cancellationToken);

        if (contract is null)
            return NotFound();

        var versions = await db.ContractDocumentVersions.AsNoTracking()
            .Where(x => x.ContractId == id)
            .OrderByDescending(x => x.VersionNumber)
            .ToListAsync(cancellationToken);

        var versionIds = versions.Select(x => x.Id).ToArray();

        var anchors = await db.BlockchainAnchors.AsNoTracking()
            .Where(x => versionIds.Contains(x.DocumentVersionId))
            .ToDictionaryAsync(x => x.DocumentVersionId, cancellationToken);

        return Ok(new
        {
            contract.Id,
            contract.BusinessReference,
            status = contract.Status.ToString(),
            contract.CurrentVersionId,
            versions = versions.Select(version =>
            {
                anchors.TryGetValue(version.Id, out var anchor);

                return new
                {
                    version.Id,
                    version.VersionNumber,
                    status = version.Status.ToString(),
                    version.DocumentHash,
                    version.PreviousVersionId,
                    version.CorrectionReason,
                    version.CreatedAtUtc,
                    version.SignedAtUtc,
                    version.SupersededAtUtc,
                    blockchain = anchor is null
                        ? null
                        : new
                        {
                            status = anchor.Status.ToString(),
                            anchor.ChainId,
                            anchor.TransactionHash,
                            anchor.BlockNumber,
                            anchor.RetryCount,
                            anchor.LastError,
                            anchor.ConfirmedAtUtc
                        }
                };
            })
        });
    }

    [HttpGet("{id:guid}/versions/{versionId:guid}/file")]
    public async Task<IActionResult> GetVersionFile(
        Guid id,
        Guid versionId,
        CancellationToken cancellationToken)
    {
        var version = await db.ContractDocumentVersions.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == versionId && x.ContractId == id, cancellationToken);

        if (version is null || string.IsNullOrWhiteSpace(version.StorageKey))
            return NotFound();

        var stream = await documentStorage.OpenReadAsync(version.StorageKey, cancellationToken);
        return File(stream, "application/pdf");
    }
}

public sealed record CreateContractRequest(string BusinessReference);

internal static class HttpContextExtensions
{
    public static Guid TraceIdentifierToGuid(this HttpContext context)
    {
        var bytes = System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(context.TraceIdentifier));

        return new Guid(bytes[..16]);
    }
}

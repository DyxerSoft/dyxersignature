using System.ComponentModel.DataAnnotations;
using System.Security.Cryptography;
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
using DyxerSignature.Api.Modules.Signatures.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DyxerSignature.Api.Modules.Contracts.Api;

[Authorize]
[ApiController]
[Route("api/v1/contracts")]
public sealed class ContractsController(
    AppDbContext db,
    IDocumentStorage documentStorage,
    DocumentIntegrityService documentIntegrity,
    EvidenceManifestBuilder evidenceBuilder) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<object>> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken cancellationToken = default)
    {
        if (page < 1 || pageSize is < 1 or > 100)
            return ValidationProblem("page must be positive and pageSize must be between 1 and 100.");

        var query = db.Contracts.AsNoTracking().Where(x => x.DeletedAtUtc == null);
        var total = await query.CountAsync(cancellationToken);
        var contracts = await query
            .OrderByDescending(x => x.CreatedAtUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new
            {
                x.Id,
                x.BusinessReference,
                x.Title,
                status = x.Status.ToString(),
                x.CurrentVersionId,
                x.CreatedAtUtc,
                x.UpdatedAtUtc
            })
            .ToListAsync(cancellationToken);

        return Ok(new { page, pageSize, total, items = contracts });
    }

    [HttpPost]
    public async Task<ActionResult<object>> Create(
        [FromBody] CreateContractRequest request,
        CancellationToken cancellationToken)
    {
        var reference = request.BusinessReference.Trim();
        if (await db.Contracts.AnyAsync(
                x => x.BusinessReference == reference,
                cancellationToken))
        {
            return Conflict(new ProblemDetails
            {
                Title = "Business reference already exists.",
                Status = StatusCodes.Status409Conflict
            });
        }

        var contract = new Contract(reference, request.Title ?? "Contrato");
        db.Contracts.Add(contract);
        db.AuditEvents.Add(NewAudit(
            contract.Id,
            null,
            "CONTRACT_CREATED",
            new { contract.BusinessReference, contract.Title }));

        await db.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(
            nameof(GetById),
            new { id = contract.Id },
            new
            {
                contract.Id,
                contract.BusinessReference,
                contract.Title,
                status = contract.Status.ToString()
            });
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<object>> GetById(
        Guid id,
        CancellationToken cancellationToken)
    {
        var contract = await db.Contracts.AsNoTracking()
            .SingleOrDefaultAsync(
                x => x.Id == id && x.DeletedAtUtc == null,
                cancellationToken);
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
        var signatures = await db.SignatureEvents.AsNoTracking()
            .Where(x => x.ContractId == id)
            .OrderBy(x => x.SignedAtUtc)
            .ToListAsync(cancellationToken);

        return Ok(new
        {
            contract.Id,
            contract.BusinessReference,
            contract.Title,
            status = contract.Status.ToString(),
            contract.CurrentVersionId,
            contract.CreatedAtUtc,
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
                            anchor.NetworkName,
                            anchor.TransactionHash,
                            anchor.LedgerNumber,
                            anchor.RetryCount,
                            anchor.LastError,
                            anchor.ConfirmedAtUtc
                        }
                };
            }),
            signatures = signatures.Select(signature => new
            {
                signature.Id,
                signature.DocumentVersionId,
                signature.SignerName,
                signature.SignerEmail,
                signature.DocumentHash,
                signature.SignedAtUtc
            })
        });
    }

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> Update(
        Guid id,
        [FromBody] UpdateContractRequest request,
        CancellationToken cancellationToken)
    {
        var contract = await db.Contracts.SingleOrDefaultAsync(
            x => x.Id == id && x.DeletedAtUtc == null,
            cancellationToken);
        if (contract is null)
            return NotFound();

        contract.UpdateTitle(request.Title);
        db.AuditEvents.Add(NewAudit(contract.Id, null, "CONTRACT_TITLE_UPDATED", new { contract.Title }));
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(
        Guid id,
        CancellationToken cancellationToken)
    {
        var contract = await db.Contracts.SingleOrDefaultAsync(
            x => x.Id == id && x.DeletedAtUtc == null,
            cancellationToken);
        if (contract is null)
            return NotFound();

        contract.SoftDelete();
        db.AuditEvents.Add(NewAudit(
            contract.Id,
            null,
            "CONTRACT_SOFT_DELETED",
            new { deletionMode = "logical" }));
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPost("{id:guid}/versions")]
    [RequestSizeLimit(25_000_000)]
    public async Task<ActionResult<object>> UploadDraftVersion(
        Guid id,
        [FromForm] IFormFile? file,
        [FromForm] string? correctionReason,
        CancellationToken cancellationToken)
    {
        if (file is null || file.Length is <= 0 or > 25_000_000)
            return ValidationProblem("A non-empty PDF up to 25 MB is required.");
        if (correctionReason?.Length > 500)
            return ValidationProblem("correctionReason must be at most 500 characters.");

        await using var validationStream = file.OpenReadStream();
        if (!await documentIntegrity.IsPdfAsync(validationStream, cancellationToken))
            return ValidationProblem("The uploaded file does not have a valid PDF header.");

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var contract = await db.Contracts.FromSqlInterpolated(
                $"""SELECT * FROM contracts WHERE "Id" = {id} AND "DeletedAtUtc" IS NULL FOR UPDATE""")
            .SingleOrDefaultAsync(cancellationToken);
        if (contract is null)
            return NotFound();

        var previous = await db.ContractDocumentVersions
            .Where(x => x.ContractId == contract.Id)
            .OrderByDescending(x => x.VersionNumber)
            .FirstOrDefaultAsync(cancellationToken);
        if (previous is not null && string.IsNullOrWhiteSpace(correctionReason))
            return ValidationProblem("correctionReason is required when creating a corrected version.");
        if (previous is not null && previous.Status is not (DocumentVersionStatus.Active or DocumentVersionStatus.Superseded))
            return Conflict(new ProblemDetails
            {
                Title = "The previous version is still being reviewed or processed.",
                Status = StatusCodes.Status409Conflict
            });

        var nextVersion = (previous?.VersionNumber ?? 0) + 1;
        await using var upload = file.OpenReadStream();
        var storageKey = await documentStorage.SavePdfAsync(
            contract.Id,
            nextVersion,
            upload,
            cancellationToken);
        await using var storedFile = await documentStorage.OpenReadAsync(storageKey, cancellationToken);
        var documentHash = await documentIntegrity.ComputeSha256Async(storedFile, cancellationToken);

        var version = new ContractDocumentVersion(
            contract.Id,
            nextVersion,
            previous?.Id,
            correctionReason);
        version.AttachDraftDocument(storageKey, documentHash);

        db.ContractDocumentVersions.Add(version);
        db.AuditEvents.Add(NewAudit(
            contract.Id,
            version.Id,
            "DOCUMENT_VERSION_DRAFT_UPLOADED",
            new { version.VersionNumber, version.DocumentHash, file.Length, version.CorrectionReason }));

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return CreatedAtAction(
            nameof(GetById),
            new { id = contract.Id },
            new
            {
                contract.Id,
                documentVersionId = version.Id,
                versionNumber = version.VersionNumber,
                documentHash,
                status = version.Status.ToString()
            });
    }

    [HttpPost("{id:guid}/versions/{versionId:guid}/review")]
    public async Task<IActionResult> ReviewVersion(
        Guid id,
        Guid versionId,
        [FromBody] ReviewDocumentRequest request,
        CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var contract = await db.Contracts.FromSqlInterpolated(
                $"""SELECT * FROM contracts WHERE "Id" = {id} AND "DeletedAtUtc" IS NULL FOR UPDATE""")
            .SingleOrDefaultAsync(cancellationToken);
        if (contract is null)
            return NotFound();

        var version = await db.ContractDocumentVersions.SingleOrDefaultAsync(
            x => x.ContractId == id && x.Id == versionId,
            cancellationToken);
        if (version is null)
            return NotFound();

        try
        {
            version.AcceptReview(request.DocumentHash);
        }
        catch (InvalidOperationException)
        {
            return Conflict(new ProblemDetails
            {
                Title = "The document hash is stale or this version cannot be reviewed.",
                Status = StatusCodes.Status409Conflict
            });
        }

        db.AuditEvents.Add(NewAudit(
            contract.Id,
            version.Id,
            "DOCUMENT_VERSION_REVIEWED",
            new { version.VersionNumber, version.DocumentHash }));
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return NoContent();
    }

    [HttpPost("{id:guid}/versions/{versionId:guid}/sign")]
    public async Task<ActionResult<object>> SignVersion(
        Guid id,
        Guid versionId,
        [FromBody] SignDocumentRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.SignerName) || request.SignerName.Length > 200)
            return ValidationProblem("signerName is required and must be at most 200 characters.");
        if (!string.IsNullOrWhiteSpace(request.SignerEmail) &&
            (request.SignerEmail.Length > 320 || !new EmailAddressAttribute().IsValid(request.SignerEmail)))
        {
            return ValidationProblem("signerEmail must be a valid email address.");
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var contract = await db.Contracts.FromSqlInterpolated(
                $"""SELECT * FROM contracts WHERE "Id" = {id} AND "DeletedAtUtc" IS NULL FOR UPDATE""")
            .SingleOrDefaultAsync(cancellationToken);
        if (contract is null)
            return NotFound();

        var version = await db.ContractDocumentVersions.SingleOrDefaultAsync(
            x => x.ContractId == id && x.Id == versionId,
            cancellationToken);
        if (version is null)
            return NotFound();

        var signedAtUtc = DateTimeOffset.UtcNow;
        try
        {
            version.MarkSigned(request.DocumentHash, signedAtUtc);
        }
        catch (InvalidOperationException)
        {
            return Conflict(new ProblemDetails
            {
                Title = "The document hash is stale or this version has not been reviewed.",
                Status = StatusCodes.Status409Conflict
            });
        }

        version.MarkBlockchainPending();
        contract.MarkSignatureInProgress();
        var previous = version.PreviousVersionId is null
            ? null
            : await db.ContractDocumentVersions.AsNoTracking()
                .SingleOrDefaultAsync(x => x.Id == version.PreviousVersionId, cancellationToken);
        var evidence = evidenceBuilder.Build(contract, version, previous?.DocumentHash);
        var anchor = new BlockchainAnchor(version.Id, version.DocumentHash!, evidence.EvidenceHash);
        var payload = new AnchorDocumentOutboxPayload(anchor.Id, contract.Id, version.Id);

        db.EvidenceManifests.Add(evidence);
        db.BlockchainAnchors.Add(anchor);
        db.OutboxMessages.Add(new OutboxMessage(
            BlockchainOutboxWorker.AnchorDocumentType,
            JsonSerializer.Serialize(payload),
            $"stellar-anchor:{version.Id:N}"));
        db.SignatureEvents.Add(new SignatureEvent(
            contract.Id,
            version.Id,
            request.SignerName.Trim(),
            request.SignerEmail,
            version.DocumentHash!,
            HttpContext.Connection.RemoteIpAddress?.ToString(),
            Request.Headers["User-Agent"].ToString()));
        db.AuditEvents.Add(NewAudit(
            contract.Id,
            version.Id,
            "DOCUMENT_VERSION_SIGNED",
            new { version.VersionNumber, version.DocumentHash, signer = request.SignerName.Trim() }));

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return AcceptedAtAction(
            nameof(GetById),
            new { id = contract.Id },
            new
            {
                contract.Id,
                documentVersionId = version.Id,
                versionNumber = version.VersionNumber,
                documentHash = version.DocumentHash,
                evidenceHash = evidence.EvidenceHash,
                status = version.Status.ToString(),
                anchorStatus = anchor.Status.ToString()
            });
    }

    private AuditEvent NewAudit(
        Guid contractId,
        Guid? versionId,
        string eventType,
        object metadata)
        => new(
            contractId,
            versionId,
            eventType,
            "USER",
            User.FindFirst("sub")?.Value,
            JsonSerializer.Serialize(metadata),
            HttpContext.TraceIdentifierToGuid());
}

public sealed class CreateContractRequest
{
    [Required]
    [StringLength(100, MinimumLength = 1)]
    public string BusinessReference { get; init; } = "";

    [StringLength(200, MinimumLength = 1)]
    public string? Title { get; init; }
}

public sealed class UpdateContractRequest
{
    [Required]
    [StringLength(200, MinimumLength = 1)]
    public string Title { get; init; } = "";
}

public sealed class ReviewDocumentRequest
{
    [Required]
    [StringLength(64, MinimumLength = 64)]
    public string DocumentHash { get; init; } = "";
}

public sealed class SignDocumentRequest
{
    [Required]
    [StringLength(64, MinimumLength = 64)]
    public string DocumentHash { get; init; } = "";

    [Required]
    [StringLength(200, MinimumLength = 1)]
    public string SignerName { get; init; } = "";

    [EmailAddress]
    [StringLength(320)]
    public string? SignerEmail { get; init; }
}

internal static class HttpContextExtensions
{
    public static Guid TraceIdentifierToGuid(this HttpContext context)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(context.TraceIdentifier));
        return new Guid(bytes[..16]);
    }
}

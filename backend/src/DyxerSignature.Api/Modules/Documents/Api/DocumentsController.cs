using System.Security.Cryptography;
using System.Text.Json;
using DyxerSignature.Api.Infrastructure.Persistence;
using DyxerSignature.Api.Modules.Audit.Domain;
using DyxerSignature.Api.Modules.Blockchain.Application;
using DyxerSignature.Api.Modules.Contracts.Api;
using DyxerSignature.Api.Modules.Documents.Application;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DyxerSignature.Api.Modules.Documents.Api;

[Authorize]
[ApiController]
[Route("api/v1")]
public sealed class DocumentsController(
    AppDbContext db,
    IDocumentStorage storage,
    DocumentIntegrityService integrity,
    IBlockchainGateway blockchainGateway) : ControllerBase
{
    [HttpGet("documents/{versionId:guid}/download")]
    public async Task<IActionResult> Download(
        Guid versionId,
        CancellationToken cancellationToken)
    {
        var document = await (
            from version in db.ContractDocumentVersions.AsNoTracking()
            join contract in db.Contracts.AsNoTracking()
                on version.ContractId equals contract.Id
            where version.Id == versionId && contract.DeletedAtUtc == null
            select new
            {
                version.Id,
                version.ContractId,
                version.VersionNumber,
                version.StorageKey,
                version.DocumentHash
            }).SingleOrDefaultAsync(cancellationToken);

        if (document is null || document.StorageKey is null)
            return NotFound();

        var url = await storage.GetPresignedReadUrlAsync(document.StorageKey, cancellationToken);
        db.AuditEvents.Add(new AuditEvent(
            document.ContractId,
            document.Id,
            "DOCUMENT_DOWNLOAD_LINK_ISSUED",
            "USER",
            User.FindFirst("sub")?.Value,
            JsonSerializer.Serialize(new
            {
                document.VersionNumber,
                expiresInMinutes = 5
            }),
            HttpContext.TraceIdentifierToGuid()));
        await db.SaveChangesAsync(cancellationToken);
        return Redirect(url);
    }

    [HttpGet("contracts/{contractId:guid}/versions/{versionId:guid}/verify")]
    public async Task<ActionResult<object>> Verify(
        Guid contractId,
        Guid versionId,
        CancellationToken cancellationToken)
    {
        if (!await db.Contracts.AsNoTracking().AnyAsync(
                x => x.Id == contractId && x.DeletedAtUtc == null,
                cancellationToken))
        {
            return NotFound();
        }

        var version = await db.ContractDocumentVersions.AsNoTracking()
            .SingleOrDefaultAsync(
                x => x.ContractId == contractId && x.Id == versionId,
                cancellationToken);
        if (version is null || version.StorageKey is null || version.DocumentHash is null)
            return NotFound();

        await using var stream = await storage.OpenReadAsync(version.StorageKey, cancellationToken);
        var storedHash = await integrity.ComputeSha256Async(stream, cancellationToken);
        var contentMatches = CryptographicOperations.FixedTimeEquals(
            Convert.FromHexString(storedHash),
            Convert.FromHexString(version.DocumentHash));
        var anchor = await db.BlockchainAnchors.AsNoTracking()
            .SingleOrDefaultAsync(x => x.DocumentVersionId == version.Id, cancellationToken);
        var onChain = await blockchainGateway.VerifyDocumentAsync(
            version.DocumentHash,
            anchor?.TransactionHash,
            cancellationToken);

        db.AuditEvents.Add(new AuditEvent(
            contractId,
            version.Id,
            "DOCUMENT_VERIFICATION_REQUESTED",
            "USER",
            User.FindFirst("sub")?.Value,
            JsonSerializer.Serialize(new { contentMatches, stellarContainsHash = onChain.Exists }),
            HttpContext.TraceIdentifierToGuid()));
        await db.SaveChangesAsync(cancellationToken);

        return Ok(new
        {
            version.Id,
            version.VersionNumber,
            expectedSha256 = version.DocumentHash,
            storedSha256 = storedHash,
            contentMatches,
            blockchain = new
            {
                network = anchor?.NetworkName ?? "Stellar Testnet",
                status = anchor?.Status.ToString() ?? "Unknown",
                transactionHash = anchor?.TransactionHash,
                ledgerNumber = onChain.LedgerNumber ?? anchor?.LedgerNumber,
                verified = onChain.Exists
            },
            verified = contentMatches && onChain.Exists
        });
    }

    [HttpGet("contracts/{contractId:guid}/documents/compare")]
    public async Task<ActionResult<object>> Compare(
        Guid contractId,
        [FromQuery] int fromVersion,
        [FromQuery] int toVersion,
        CancellationToken cancellationToken)
    {
        if (fromVersion <= 0 || toVersion <= 0 || fromVersion == toVersion)
            return ValidationProblem("fromVersion and toVersion must be different positive version numbers.");
        if (!await db.Contracts.AsNoTracking().AnyAsync(
                x => x.Id == contractId && x.DeletedAtUtc == null,
                cancellationToken))
        {
            return NotFound();
        }

        var versions = await db.ContractDocumentVersions.AsNoTracking()
            .Where(x =>
                x.ContractId == contractId &&
                (x.VersionNumber == fromVersion || x.VersionNumber == toVersion))
            .ToListAsync(cancellationToken);
        if (versions.Count != 2)
            return NotFound();

        var source = versions.Single(x => x.VersionNumber == fromVersion);
        var target = versions.Single(x => x.VersionNumber == toVersion);
        var anchors = await db.BlockchainAnchors.AsNoTracking()
            .Where(x => x.DocumentVersionId == source.Id || x.DocumentVersionId == target.Id)
            .ToDictionaryAsync(x => x.DocumentVersionId, cancellationToken);

        return Ok(new
        {
            contractId,
            source = new
            {
                source.Id,
                source.VersionNumber,
                source.DocumentHash,
                status = source.Status.ToString(),
                source.CorrectionReason,
                source.SignedAtUtc,
                blockchainStatus = anchors.GetValueOrDefault(source.Id)?.Status.ToString()
            },
            target = new
            {
                target.Id,
                target.VersionNumber,
                target.DocumentHash,
                status = target.Status.ToString(),
                target.CorrectionReason,
                target.SignedAtUtc,
                blockchainStatus = anchors.GetValueOrDefault(target.Id)?.Status.ToString()
            },
            hashChanged = !StringComparer.OrdinalIgnoreCase.Equals(
                source.DocumentHash,
                target.DocumentHash),
            binaryDiffAvailable = false,
            comparison = "Metadata and SHA-256 comparison; PDFs remain immutable private objects."
        });
    }
}

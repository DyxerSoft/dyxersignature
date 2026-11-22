using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using DyxerSignature.Api.Infrastructure.Persistence;
using DyxerSignature.Api.Modules.Blockchain.Domain;
using DyxerSignature.Api.Modules.Contracts.Domain;

namespace DyxerSignature.Api.Modules.Dashboard.Api;

[Authorize]
[ApiController]
[Route("api/v1/dashboard")]
public sealed class DashboardController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<object>> Get(CancellationToken cancellationToken)
    {
        var contracts = db.Contracts.AsNoTracking().Where(x => x.DeletedAtUtc == null);
        var contractCount = await contracts.CountAsync(cancellationToken);
        var versionsCount = await (
            from version in db.ContractDocumentVersions.AsNoTracking()
            join contract in contracts on version.ContractId equals contract.Id
            select version.Id).CountAsync(cancellationToken);

        var signatureCount = await (
            from signature in db.SignatureEvents.AsNoTracking()
            join contract in contracts on signature.ContractId equals contract.Id
            select signature.Id).CountAsync(cancellationToken);

        var monthStartUtc = new DateTimeOffset(
            DateTimeOffset.UtcNow.Year,
            DateTimeOffset.UtcNow.Month,
            1,
            0,
            0,
            0,
            TimeSpan.Zero);

        var signedThisMonth = await (
            from signature in db.SignatureEvents.AsNoTracking()
            join contract in contracts on signature.ContractId equals contract.Id
            where signature.SignedAtUtc >= monthStartUtc
            select signature.Id).CountAsync(cancellationToken);

        var statusCounts = await contracts
            .GroupBy(x => x.Status)
            .Select(group => new { Status = group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);

        var pendingAnchors = await (
            from anchor in db.BlockchainAnchors.AsNoTracking()
            join version in db.ContractDocumentVersions.AsNoTracking()
                on anchor.DocumentVersionId equals version.Id
            join contract in contracts on version.ContractId equals contract.Id
            where anchor.Status != BlockchainAnchorStatus.Confirmed
            select anchor.Id).CountAsync(cancellationToken);

        var signatureIntervals = await (
            from signature in db.SignatureEvents.AsNoTracking()
            join contract in contracts on signature.ContractId equals contract.Id
            group signature by new { signature.ContractId, contract.CreatedAtUtc }
            into signatureGroup
            select new
            {
                signatureGroup.Key.CreatedAtUtc,
                FirstSignatureAtUtc = signatureGroup.Min(x => x.SignedAtUtc)
            }).ToListAsync(cancellationToken);

        var averageSignatureHours = signatureIntervals.Count == 0
            ? 0
            : Math.Round(
                signatureIntervals.Average(x =>
                    (x.FirstSignatureAtUtc - x.CreatedAtUtc).TotalHours),
                2);

        // Histogram of signatures per signed contract; all numbers derive from persisted events.
        var signatureFrequency = await (
            from signature in db.SignatureEvents.AsNoTracking()
            join contract in contracts on signature.ContractId equals contract.Id
            group signature by signature.ContractId into grouped
            select grouped.Count()).ToListAsync(cancellationToken);

        var frequency = new
        {
            one = signatureFrequency.Count(count => count == 1),
            two = signatureFrequency.Count(count => count == 2),
            three = signatureFrequency.Count(count => count == 3),
            four = signatureFrequency.Count(count => count == 4),
            fivePlus = signatureFrequency.Count(count => count >= 5)
        };

        return Ok(new
        {
            generatedAtUtc = DateTimeOffset.UtcNow,
            contracts = new
            {
                total = contractCount,
                active = statusCounts
                    .Where(x => x.Status == ContractStatus.Active)
                    .Sum(x => x.Count),
                byStatus = statusCounts.ToDictionary(
                    x => x.Status.ToString(),
                    x => x.Count)
            },
            documents = new { versions = versionsCount },
            signatures = new
            {
                total = signatureCount,
                thisMonth = signedThisMonth,
                averagePerContract = contractCount == 0
                    ? 0
                    : Math.Round((double)signatureCount / contractCount, 2),
                averageHoursToFirstSignature = averageSignatureHours,
                frequency
            },
            blockchain = new { pending = pendingAnchors }
        });
    }
}


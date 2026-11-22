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

        // Aggregate statuses in PostgreSQL; do not load all anchors into memory.
        var anchorsForVisibleContracts =
            from anchor in db.BlockchainAnchors.AsNoTracking()
            join version in db.ContractDocumentVersions.AsNoTracking()
                on anchor.DocumentVersionId equals version.Id
            join contract in contracts on version.ContractId equals contract.Id
            select anchor;

        var statusByAnchor = await anchorsForVisibleContracts
            .GroupBy(anchor => anchor.Status)
            .Select(group => new { Status = group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);
        var confirmedAnchors = statusByAnchor
            .Where(group => group.Status == BlockchainAnchorStatus.Confirmed)
            .Sum(group => group.Count);
        var failedAnchors = statusByAnchor
            .Where(group => group.Status == BlockchainAnchorStatus.Failed)
            .Sum(group => group.Count);
        var pendingAnchors = statusByAnchor
            .Where(group => group.Status != BlockchainAnchorStatus.Confirmed)
            .Sum(group => group.Count);
        var retryingAnchors = await anchorsForVisibleContracts
            .CountAsync(anchor =>
                anchor.Status != BlockchainAnchorStatus.Confirmed && anchor.RetryCount > 0,
                cancellationToken);
        var oneHourAgo = DateTimeOffset.UtcNow.AddHours(-1);
        var confirmedLastHour = await anchorsForVisibleContracts
            .CountAsync(anchor =>
                anchor.Status == BlockchainAnchorStatus.Confirmed &&
                anchor.ConfirmedAtUtc >= oneHourAgo,
                cancellationToken);
        var oldestUnconfirmedAtUtc = await anchorsForVisibleContracts
            .Where(anchor => anchor.Status != BlockchainAnchorStatus.Confirmed)
            .OrderBy(anchor => anchor.CreatedAtUtc)
            .Select(anchor => (DateTimeOffset?)anchor.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);
        var oldestPendingSeconds = oldestUnconfirmedAtUtc is null
            ? 0L
            : Math.Max(0L, (long)(DateTimeOffset.UtcNow - oldestUnconfirmedAtUtc.Value).TotalSeconds);

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

        // Dashboard activity shows distinct contracts (not every audit event).
        // The full append-only timeline remains available from /contracts/{id}/audit.
        var auditSummary = db.AuditEvents.AsNoTracking()
            .GroupBy(e => e.ContractId)
            .Select(g => new
            {
                ContractId = g.Key,
                LastEventAtUtc = g.Max(e => e.OccurredAtUtc),
                EventCount = g.Count()
            });

        var recentActivity = await (
            from contract in contracts
            join summary in auditSummary on contract.Id equals summary.ContractId
            orderby summary.LastEventAtUtc descending, contract.Id
            select new
            {
                ContractId = contract.Id,
                contract.BusinessReference,
                contract.Title,
                summary.EventCount,
                OccurredAtUtc = summary.LastEventAtUtc,
                EventType = db.AuditEvents.AsNoTracking()
                    .Where(e => e.ContractId == contract.Id)
                    .OrderByDescending(e => e.OccurredAtUtc)
                    .ThenByDescending(e => e.Id)
                    .Select(e => e.EventType)
                    .FirstOrDefault()
            })
            .Take(8)
            .ToListAsync(cancellationToken);

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
            recentActivity,
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
            blockchain = new
            {
                pending = pendingAnchors,
                confirmed = confirmedAnchors,
                failed = failedAnchors,
                retrying = retryingAnchors,
                confirmedLastHour,
                oldestPendingSeconds
            }
        });
    }
}


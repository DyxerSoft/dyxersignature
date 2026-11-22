using DyxerSignature.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DyxerSignature.Api.Modules.Audit.Api;

[Authorize]
[ApiController]
[Route("api/v1/contracts/{contractId:guid}/audit")]
public sealed class AuditController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<object>> List(
        Guid contractId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        CancellationToken cancellationToken = default)
    {
        if (page < 1 || pageSize is < 1 or > 200)
            return ValidationProblem("page must be positive and pageSize must be between 1 and 200.");

        if (!await db.Contracts.AsNoTracking().AnyAsync(x => x.Id == contractId, cancellationToken))
            return NotFound();

        var query = db.AuditEvents.AsNoTracking().Where(x => x.ContractId == contractId);
        var total = await query.CountAsync(cancellationToken);
        var events = await query
            .OrderByDescending(x => x.OccurredAtUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new
            {
                x.Id,
                x.DocumentVersionId,
                x.EventType,
                x.ActorType,
                x.ActorId,
                x.MetadataJson,
                x.CorrelationId,
                x.OccurredAtUtc
            })
            .ToListAsync(cancellationToken);

        return Ok(new { contractId, page, pageSize, total, items = events });
    }
}


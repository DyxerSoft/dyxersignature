using DyxerSignature.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DyxerSignature.Api.Modules.Signatures.Api;

[Authorize]
[ApiController]
[Route("api/v1/contracts/{contractId:guid}/signatures")]
public sealed class SignaturesController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<object>> List(
        Guid contractId,
        CancellationToken cancellationToken)
    {
        var contractExists = await db.Contracts.AsNoTracking()
            .AnyAsync(x => x.Id == contractId, cancellationToken);
        if (!contractExists)
            return NotFound();

        var signers = await db.SignatureEvents.AsNoTracking()
            .Where(x => x.ContractId == contractId)
            .OrderBy(x => x.SignedAtUtc)
            .Select(x => new
            {
                x.Id,
                x.DocumentVersionId,
                x.SignerName,
                x.SignerEmail,
                x.DocumentHash,
                x.SignedAtUtc
            })
            .ToListAsync(cancellationToken);

        return Ok(new { contractId, signers });
    }
}


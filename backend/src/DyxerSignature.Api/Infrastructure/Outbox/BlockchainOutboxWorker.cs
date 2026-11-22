using System.Text.Json;
using DyxerSignature.Api.Infrastructure.Persistence;
using DyxerSignature.Api.Modules.Audit.Domain;
using DyxerSignature.Api.Modules.Blockchain.Application;
using DyxerSignature.Api.Modules.Blockchain.Domain;
using DyxerSignature.Api.Modules.Contracts.Domain;
using Microsoft.EntityFrameworkCore;

namespace DyxerSignature.Api.Infrastructure.Outbox;

public sealed class BlockchainOutboxWorker(
    IServiceScopeFactory scopeFactory,
    IBlockchainGateway blockchainGateway,
    ILogger<BlockchainOutboxWorker> logger) : BackgroundService
{
    public const string AnchorDocumentType = "blockchain.anchor-document.v1";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var processed = await ProcessNextAsync(stoppingToken);

            if (!processed)
                await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
        }
    }

    private async Task<bool> ProcessNextAsync(CancellationToken cancellationToken)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = DateTimeOffset.UtcNow;

        var message = await db.OutboxMessages
            .Where(x =>
                x.CompletedAtUtc == null &&
                x.NextAttemptAtUtc <= now &&
                x.Type == AnchorDocumentType)
            .OrderBy(x => x.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        if (message is null)
            return false;

        try
        {
            var payload = JsonSerializer.Deserialize<AnchorDocumentOutboxPayload>(message.PayloadJson)
                ?? throw new InvalidOperationException("Invalid outbox payload.");

            var anchor = await db.BlockchainAnchors
                .SingleAsync(x => x.Id == payload.AnchorId, cancellationToken);
            var version = await db.ContractDocumentVersions
                .SingleAsync(x => x.Id == payload.DocumentVersionId, cancellationToken);
            var contract = await db.Contracts
                .SingleAsync(x => x.Id == payload.ContractId, cancellationToken);

            if (anchor.Status == BlockchainAnchorStatus.Confirmed &&
                version.Status == DocumentVersionStatus.Active)
            {
                message.Complete();
                await db.SaveChangesAsync(cancellationToken);
                return true;
            }

            anchor.PrepareRetry();

            var submission = await blockchainGateway.AnchorDocumentAsync(
                anchor.DocumentHash,
                anchor.EvidenceHash,
                cancellationToken);

            if (submission.TransactionHash is not null)
            {
                anchor.MarkSubmitted(submission.ChainId, submission.TransactionHash);
                version.MarkBlockchainSubmitted();
            }

            anchor.MarkConfirmed(submission.ChainId, submission.BlockNumber);
            version.MarkBlockchainConfirmed();

            var previousActive = await db.ContractDocumentVersions
                .Where(x =>
                    x.ContractId == contract.Id &&
                    x.Id != version.Id &&
                    x.Status == DocumentVersionStatus.Active)
                .SingleOrDefaultAsync(cancellationToken);

            var newerVersionExists = await db.ContractDocumentVersions
                .AnyAsync(
                    x => x.ContractId == contract.Id && x.VersionNumber > version.VersionNumber,
                    cancellationToken);

            if (newerVersionExists)
            {
                message.Complete();
                db.AuditEvents.Add(new AuditEvent(
                    contract.Id,
                    version.Id,
                    "BLOCKCHAIN_CONFIRMED_HISTORICAL_VERSION",
                    "SYSTEM",
                    null,
                    JsonSerializer.Serialize(new
                    {
                        anchor.Id,
                        submission.TransactionHash,
                        version.VersionNumber,
                        reason = "A newer immutable version already exists."
                    }),
                    Guid.NewGuid()));
                await db.SaveChangesAsync(cancellationToken);
                return true;
            }

            if (previousActive is not null)
            {
                previousActive.Supersede();
            }

            version.Activate();
            contract.ActivateVersion(version.Id);

            db.AuditEvents.Add(new AuditEvent(
                contract.Id,
                version.Id,
                "BLOCKCHAIN_CONFIRMED_AND_VERSION_ACTIVATED",
                "SYSTEM",
                null,
                JsonSerializer.Serialize(new
                {
                    anchor.Id,
                    submission.ChainId,
                    submission.TransactionHash,
                    submission.BlockNumber,
                    submission.AlreadyAnchored,
                    version.VersionNumber
                }),
                Guid.NewGuid()));

            message.Complete();
            await db.SaveChangesAsync(cancellationToken);

            logger.LogInformation(
                "Activated contract {ContractId} version {VersionNumber} after blockchain confirmation.",
                contract.Id,
                version.VersionNumber);

            return true;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Outbox message {MessageId} failed.", message.Id);
            message.ScheduleRetry(ex.Message);

            try
            {
                var payload = JsonSerializer.Deserialize<AnchorDocumentOutboxPayload>(message.PayloadJson);
                if (payload is not null)
                {
                    var anchor = await db.BlockchainAnchors
                        .SingleOrDefaultAsync(x => x.Id == payload.AnchorId, cancellationToken);
                    anchor?.RegisterFailure(ex.Message);
                }

                await db.SaveChangesAsync(cancellationToken);
            }
            catch (Exception persistenceEx)
            {
                logger.LogError(
                    persistenceEx,
                    "Could not persist retry state for outbox message {MessageId}.",
                    message.Id);
            }

            return true;
        }
    }
}


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
    private static readonly TimeSpan ClaimDuration = TimeSpan.FromMinutes(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var processed = await ProcessNextAsync(stoppingToken);
                if (!processed)
                    await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Stellar outbox polling failed; retrying shortly.");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }
    }

    private async Task<bool> ProcessNextAsync(CancellationToken cancellationToken)
    {
        var claim = await ClaimNextAsync(cancellationToken);
        if (claim is null)
            return false;

        try
        {
            await ProcessClaimedAsync(claim.Value.Id, claim.Value.Token, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // The lease expires if shutdown interrupts external I/O. The same persisted envelope is retried.
            throw;
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Stellar outbox message {MessageId} failed.", claim.Value.Id);
            await PersistRetryAsync(claim.Value.Id, claim.Value.Token, exception, cancellationToken);
        }

        return true;
    }

    private async Task<(Guid Id, Guid Token)?> ClaimNextAsync(CancellationToken cancellationToken)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;
        var dueMessages = await db.OutboxMessages.FromSqlInterpolated($"""
                SELECT * FROM outbox_messages
                WHERE "CompletedAtUtc" IS NULL
                  AND "NextAttemptAtUtc" <= {now}
                  AND "Type" = {AnchorDocumentType}
                  AND ("ClaimedUntilUtc" IS NULL OR "ClaimedUntilUtc" <= {now})
                ORDER BY "CreatedAtUtc"
                LIMIT 1 FOR UPDATE SKIP LOCKED
                """)
            .ToListAsync(cancellationToken);
        var message = dueMessages.SingleOrDefault();
        if (message is null)
            return null;

        var token = Guid.NewGuid();
        message.Claim(token, now.Add(ClaimDuration));
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return (message.Id, token);
    }

    private async Task ProcessClaimedAsync(
        Guid messageId,
        Guid claimToken,
        CancellationToken cancellationToken)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var message = await db.OutboxMessages.SingleAsync(x => x.Id == messageId, cancellationToken);
        EnsureClaim(message, claimToken);

        var payload = JsonSerializer.Deserialize<AnchorDocumentOutboxPayload>(message.PayloadJson)
            ?? throw new InvalidOperationException("Invalid Stellar outbox payload.");
        var anchor = await db.BlockchainAnchors.SingleAsync(x => x.Id == payload.AnchorId, cancellationToken);
        var version = await db.ContractDocumentVersions.SingleAsync(
            x => x.Id == payload.DocumentVersionId,
            cancellationToken);

        AnchorSubmission submission;
        if (anchor.Status == BlockchainAnchorStatus.Confirmed && anchor.TransactionHash is not null)
        {
            submission = new AnchorSubmission(
                anchor.NetworkName ?? "Stellar Testnet",
                anchor.TransactionHash,
                anchor.LedgerNumber,
                true);
        }
        else
        {
            anchor.PrepareRetry();
            PreparedDocumentAnchor prepared;
            if (anchor.TransactionHash is null || anchor.PreparedEnvelopeXdr is null)
            {
                prepared = await blockchainGateway.PrepareDocumentAsync(anchor.DocumentHash, cancellationToken);
                anchor.MarkPrepared(
                    prepared.NetworkName,
                    prepared.TransactionHash,
                    prepared.SignedEnvelopeXdr);
                // Persist the signed envelope and deterministic transaction hash before any network submission.
                await db.SaveChangesAsync(cancellationToken);
            }
            else
            {
                prepared = new PreparedDocumentAnchor(
                    anchor.NetworkName ?? "Stellar Testnet",
                    anchor.DocumentHash,
                    anchor.TransactionHash,
                    anchor.PreparedEnvelopeXdr);
            }

            submission = await blockchainGateway.SubmitPreparedDocumentAsync(prepared, cancellationToken);
            anchor.MarkSubmitted(submission.NetworkName, submission.TransactionHash);
            version.MarkBlockchainSubmitted();
            anchor.MarkConfirmed(
                submission.NetworkName,
                submission.TransactionHash,
                submission.LedgerNumber);
            version.MarkBlockchainConfirmed();
        }

        await using var activationTransaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var contract = await db.Contracts.FromSqlInterpolated($"""
                SELECT * FROM contracts
                WHERE "Id" = {payload.ContractId}
                FOR UPDATE
                """)
            .SingleOrDefaultAsync(cancellationToken);
        if (contract is null)
            throw new InvalidOperationException("The contract row for a Stellar outbox message was not found.");

        if (contract.DeletedAtUtc is not null)
        {
            db.AuditEvents.Add(NewAudit(
                contract.Id,
                version.Id,
                "BLOCKCHAIN_CONFIRMED_FOR_DELETED_CONTRACT",
                new { anchor.Id, submission.TransactionHash, version.VersionNumber }));
        }
        else
        {
            var newerVersionExists = await db.ContractDocumentVersions.AnyAsync(
                x => x.ContractId == contract.Id && x.VersionNumber > version.VersionNumber,
                cancellationToken);
            if (newerVersionExists)
            {
                db.AuditEvents.Add(NewAudit(
                    contract.Id,
                    version.Id,
                    "BLOCKCHAIN_CONFIRMED_HISTORICAL_VERSION",
                    new
                    {
                        anchor.Id,
                        submission.TransactionHash,
                        submission.NetworkName,
                        version.VersionNumber,
                        reason = "A newer immutable version already exists."
                    }));
            }
            else
            {
                var previousActive = await db.ContractDocumentVersions
                    .Where(x =>
                        x.ContractId == contract.Id &&
                        x.Id != version.Id &&
                        x.Status == DocumentVersionStatus.Active)
                    .SingleOrDefaultAsync(cancellationToken);

                previousActive?.Supersede();
                version.Activate();
                contract.ActivateVersion(version.Id);
                db.AuditEvents.Add(NewAudit(
                    contract.Id,
                    version.Id,
                    "BLOCKCHAIN_CONFIRMED_AND_VERSION_ACTIVATED",
                    new
                    {
                        anchor.Id,
                        submission.NetworkName,
                        submission.TransactionHash,
                        submission.LedgerNumber,
                        submission.AlreadyAnchored,
                        version.VersionNumber
                    }));
            }
        }

        message.Complete(claimToken);
        await db.SaveChangesAsync(cancellationToken);
        await activationTransaction.CommitAsync(cancellationToken);

        logger.LogInformation(
            "Confirmed Stellar transaction {TransactionHash} for contract {ContractId} version {VersionNumber}.",
            submission.TransactionHash,
            contract.Id,
            version.VersionNumber);
    }

    private async Task PersistRetryAsync(
        Guid messageId,
        Guid claimToken,
        Exception exception,
        CancellationToken cancellationToken)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var message = await db.OutboxMessages.SingleOrDefaultAsync(
                x => x.Id == messageId,
                cancellationToken);
            if (message is null || message.ClaimToken != claimToken)
                return;

            var payload = JsonSerializer.Deserialize<AnchorDocumentOutboxPayload>(message.PayloadJson);
            if (payload is not null)
            {
                var anchor = await db.BlockchainAnchors.SingleOrDefaultAsync(
                    x => x.Id == payload.AnchorId,
                    cancellationToken);
                anchor?.RegisterFailure(exception.Message);
            }

            message.ScheduleRetry(claimToken, exception.Message);
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (Exception persistenceException)
        {
            logger.LogError(
                persistenceException,
                "Could not persist retry state for Stellar outbox message {MessageId}.",
                messageId);
        }
    }

    private static void EnsureClaim(OutboxMessage message, Guid token)
    {
        if (message.ClaimToken != token)
            throw new InvalidOperationException("Stellar outbox lease is no longer owned by this worker.");
    }

    private static AuditEvent NewAudit(Guid contractId, Guid versionId, string eventType, object metadata)
        => new(
            contractId,
            versionId,
            eventType,
            "SYSTEM",
            null,
            JsonSerializer.Serialize(metadata),
            Guid.NewGuid());
}

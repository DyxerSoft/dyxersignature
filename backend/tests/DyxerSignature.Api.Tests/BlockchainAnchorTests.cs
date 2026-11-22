using DyxerSignature.Api.Infrastructure.Outbox;
using DyxerSignature.Api.Modules.Blockchain.Domain;
using Xunit;

namespace DyxerSignature.Api.Tests;

public sealed class BlockchainAnchorTests
{
    private const string ValidSha256 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    [Fact]
    public void PreparedEnvelopeSurvivesRetryAndIsClearedOnConfirmation()
    {
        var anchor = new BlockchainAnchor(Guid.NewGuid(), ValidSha256, ValidSha256);
        anchor.MarkPrepared("Stellar Testnet", ValidSha256, "signed-xdr-envelope");
        anchor.RegisterFailure("Horizon response timed out");
        anchor.PrepareRetry();

        Assert.Equal(BlockchainAnchorStatus.Prepared, anchor.Status);
        Assert.Equal("signed-xdr-envelope", anchor.PreparedEnvelopeXdr);
        Assert.Equal(ValidSha256, anchor.TransactionHash);

        anchor.MarkConfirmed("Stellar Testnet", ValidSha256, 12345);

        Assert.Equal(BlockchainAnchorStatus.Confirmed, anchor.Status);
        Assert.Null(anchor.PreparedEnvelopeXdr);
        Assert.Equal(12345L, anchor.LedgerNumber.GetValueOrDefault());
    }

    [Fact]
    public void OutboxCompletionRequiresTheCurrentLeaseToken()
    {
        var message = new OutboxMessage("anchor", "{}");
        var token = Guid.NewGuid();
        message.Claim(token, DateTimeOffset.UtcNow.AddMinutes(5));

        Assert.Throws<InvalidOperationException>(() => message.Complete(Guid.NewGuid()));

        message.Complete(token);
        Assert.NotNull(message.CompletedAtUtc);
        Assert.Null(message.ClaimToken);
        Assert.Throws<InvalidOperationException>(() => message.Claim(Guid.NewGuid(), DateTimeOffset.UtcNow.AddMinutes(5)));
    }
}

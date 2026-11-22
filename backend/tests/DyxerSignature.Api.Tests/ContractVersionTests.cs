using DyxerSignature.Api.Modules.Contracts.Domain;
using Xunit;

namespace DyxerSignature.Api.Tests;

public sealed class ContractVersionTests
{
    private const string ValidSha256 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    [Fact]
    public void ContractSoftDeleteIsLogicalAndIdempotent()
    {
        var contract = new Contract("  REF-001  ", "  Acuerdo  ");

        contract.SoftDelete();
        var deletedAt = contract.DeletedAtUtc;
        contract.SoftDelete();

        Assert.Equal("REF-001", contract.BusinessReference);
        Assert.Equal("Acuerdo", contract.Title);
        Assert.NotNull(deletedAt);
        Assert.Equal(deletedAt, contract.DeletedAtUtc);
        Assert.Equal(ContractStatus.Draft, contract.Status);
    }

    [Fact]
    public void CorrectionReasonAndSignedContentSurviveLifecycleTransitions()
    {
        var version = new ContractDocumentVersion(
            Guid.NewGuid(),
            2,
            Guid.NewGuid(),
            "Ajuste de cláusula 8");
        var signedAt = DateTimeOffset.UtcNow;

        version.AttachDraftDocument("contracts/ref/v2/file.pdf", ValidSha256);
        version.AcceptReview(ValidSha256);
        version.MarkSigned(ValidSha256, signedAt);
        version.MarkBlockchainPending();
        version.MarkBlockchainSubmitted();
        version.MarkBlockchainConfirmed();
        version.Activate();
        version.Supersede();

        Assert.Equal(2, version.VersionNumber);
        Assert.Equal("Ajuste de cláusula 8", version.CorrectionReason);
        Assert.Equal(ValidSha256, version.DocumentHash);
        Assert.Equal(signedAt, version.SignedAtUtc);
        Assert.Equal(DocumentVersionStatus.Superseded, version.Status);
        Assert.NotNull(version.SupersededAtUtc);
        Assert.Throws<InvalidOperationException>(() =>
            version.MarkSigned(ValidSha256, DateTimeOffset.UtcNow));
    }

    [Fact]
    public void SignedVersionRejectsNonHexSha256()
    {
        var version = new ContractDocumentVersion(Guid.NewGuid(), 1);

        Assert.Throws<ArgumentException>(() =>
            version.AttachDraftDocument("contracts/ref/v1/file.pdf", new string('z', 64)));
    }
}


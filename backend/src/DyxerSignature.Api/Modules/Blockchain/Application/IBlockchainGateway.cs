namespace DyxerSignature.Api.Modules.Blockchain.Application;

public interface IBlockchainGateway
{
    Task<AnchorSubmission> AnchorDocumentAsync(
        string documentHash,
        string evidenceHash,
        CancellationToken cancellationToken);

    Task<AnchorVerification> VerifyDocumentAsync(
        string documentHash,
        CancellationToken cancellationToken);
}

public sealed record AnchorSubmission(
    long ChainId,
    string? TransactionHash,
    long? BlockNumber,
    bool AlreadyAnchored);

public sealed record AnchorVerification(bool Exists);

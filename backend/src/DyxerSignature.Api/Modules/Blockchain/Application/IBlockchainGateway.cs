namespace DyxerSignature.Api.Modules.Blockchain.Application;

public interface IBlockchainGateway
{
    Task<PreparedDocumentAnchor> PrepareDocumentAsync(
        string documentHash,
        CancellationToken cancellationToken);

    Task<AnchorSubmission> SubmitPreparedDocumentAsync(
        PreparedDocumentAnchor prepared,
        CancellationToken cancellationToken);

    Task<AnchorVerification> VerifyDocumentAsync(
        string documentHash,
        string? transactionHash,
        CancellationToken cancellationToken);
}

public sealed record PreparedDocumentAnchor(
    string NetworkName,
    string DocumentHash,
    string TransactionHash,
    string SignedEnvelopeXdr);

public sealed record AnchorSubmission(
    string NetworkName,
    string TransactionHash,
    long? LedgerNumber,
    bool AlreadyAnchored);

public sealed record AnchorVerification(bool Exists, long? LedgerNumber);

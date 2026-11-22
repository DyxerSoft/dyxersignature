using System.Security.Cryptography;
using System.Text;
using DyxerSignature.Api.Modules.Blockchain.Application;
using Microsoft.Extensions.Options;
using StellarDotnetSdk;
using StellarDotnetSdk.Accounts;
using StellarDotnetSdk.Operations;
using StellarDotnetSdk.Responses.Operations;
using StellarDotnetSdk.Transactions;

namespace DyxerSignature.Api.Modules.Blockchain.Infrastructure;

/// <summary>
/// Anchors only a SHA-256 value in one reusable Stellar Testnet account data entry.
/// A signed envelope is persisted before submission so retries resubmit the same transaction.
/// </summary>
public sealed class StellarBlockchainGateway : IBlockchainGateway, IDisposable
{
    private const string DataKey = "dyxersignature.hash";
    private const string NetworkName = "Stellar Testnet";
    private readonly Server _server;
    private readonly KeyPair? _source;
    private readonly Network _network = Network.Test();

    public StellarBlockchainGateway(IOptions<StellarOptions> options)
    {
        var configuration = options.Value;
        if (!string.Equals(configuration.Network, "Testnet", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("This gateway only permits Stellar Testnet.");
        if (!Uri.TryCreate(configuration.HorizonUrl, UriKind.Absolute, out var horizonUri) ||
            horizonUri.Scheme != Uri.UriSchemeHttps ||
            !string.Equals(horizonUri.Host, "horizon-testnet.stellar.org", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                "HorizonUrl must use the official https://horizon-testnet.stellar.org endpoint.");
        }

        if (!string.IsNullOrWhiteSpace(configuration.SecretSeed))
        {
            _source = KeyPair.FromSecretSeed(configuration.SecretSeed);
            if (!string.IsNullOrWhiteSpace(configuration.PublicKey) &&
                !StringComparer.Ordinal.Equals(configuration.PublicKey, _source.AccountId))
            {
                _source.Dispose();
                throw new InvalidOperationException("Configured Stellar public key does not match the supplied secret seed.");
            }
        }

        _server = new Server(configuration.HorizonUrl);
    }

    public async Task<PreparedDocumentAnchor> PrepareDocumentAsync(
        string documentHash,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        EnsureSha256(documentHash);
        var source = RequireSource();
        var account = await _server.Accounts.Account(source.AccountId);
        cancellationToken.ThrowIfCancellationRequested();

        var transaction = new TransactionBuilder(account)
            .AddOperation(new ManageDataOperation(DataKey, documentHash.ToLowerInvariant()))
            .AddTimeBounds(new TimeBounds(TimeSpan.FromMinutes(2)))
            .Build();
        transaction.Sign(source, _network);

        return new PreparedDocumentAnchor(
            NetworkName,
            documentHash.ToLowerInvariant(),
            Convert.ToHexString(transaction.Hash(_network)).ToLowerInvariant(),
            transaction.ToEnvelopeXdrBase64());
    }

    public async Task<AnchorSubmission> SubmitPreparedDocumentAsync(
        PreparedDocumentAnchor prepared,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        EnsureSha256(prepared.DocumentHash);
        if (!string.Equals(prepared.NetworkName, NetworkName, StringComparison.Ordinal) ||
            !IsSha256(prepared.TransactionHash))
        {
            throw new InvalidOperationException("Prepared Stellar transaction metadata is invalid.");
        }

        var transaction = TransactionBuilder.FromEnvelopeXdr(prepared.SignedEnvelopeXdr) as Transaction
            ?? throw new InvalidOperationException("Prepared envelope is not a Stellar transaction.");
        var calculatedHash = Convert.ToHexString(transaction.Hash(_network)).ToLowerInvariant();
        if (!StringComparer.OrdinalIgnoreCase.Equals(calculatedHash, prepared.TransactionHash) ||
            !transaction.Operations.OfType<ManageDataOperation>().Any(operation =>
                operation.Name == DataKey &&
                operation.Value is not null &&
                StringComparer.Ordinal.Equals(
                    Encoding.UTF8.GetString(operation.Value),
                    prepared.DocumentHash.ToLowerInvariant())))
        {
            throw new InvalidOperationException("Prepared transaction does not contain the expected document hash.");
        }

        try
        {
            var response = await _server.SubmitTransaction(transaction);
            if (response is { IsSuccess: true } &&
                StringComparer.OrdinalIgnoreCase.Equals(response.Hash, prepared.TransactionHash))
            {
                return new AnchorSubmission(NetworkName, prepared.TransactionHash, response.Ledger, false);
            }

            var recovered = await FindConfirmedSubmissionAsync(prepared, cancellationToken);
            if (recovered is not null)
                return recovered;

            throw new InvalidOperationException("Stellar Testnet did not confirm the prepared transaction.");
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception submissionError)
        {
            var recovered = await FindConfirmedSubmissionAsync(prepared, cancellationToken);
            if (recovered is not null)
                return recovered;

            throw new HttpRequestException(
                "Stellar submission could not be confirmed; the persisted signed envelope is safe to retry.",
                submissionError);
        }
    }

    public async Task<AnchorVerification> VerifyDocumentAsync(
        string documentHash,
        string? transactionHash,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        EnsureSha256(documentHash);
        if (!IsSha256(transactionHash))
            return new AnchorVerification(false, null);

        var transaction = await _server.Transactions.Transaction(transactionHash!);
        if (!transaction.Successful ||
            !StringComparer.OrdinalIgnoreCase.Equals(transaction.Hash, transactionHash))
        {
            return new AnchorVerification(false, transaction.Ledger);
        }

        var operations = await _server.Operations.ForTransaction(transactionHash!).Execute();
        cancellationToken.ThrowIfCancellationRequested();
        var exists = operations.Records
            .OfType<ManageDataOperationResponse>()
            .Any(operation =>
                operation.Name == DataKey &&
                ValueMatches(operation.Value, documentHash));

        return new AnchorVerification(exists, transaction.Ledger);
    }

    public void Dispose()
    {
        _source?.Dispose();
        _server.Dispose();
    }

    private async Task<AnchorSubmission?> FindConfirmedSubmissionAsync(
        PreparedDocumentAnchor prepared,
        CancellationToken cancellationToken)
    {
        try
        {
            var transaction = await _server.Transactions.Transaction(prepared.TransactionHash);
            if (!transaction.Successful ||
                !StringComparer.OrdinalIgnoreCase.Equals(transaction.Hash, prepared.TransactionHash))
            {
                return null;
            }

            var operations = await _server.Operations.ForTransaction(prepared.TransactionHash).Execute();
            cancellationToken.ThrowIfCancellationRequested();
            var containsExpectedHash = operations.Records
                .OfType<ManageDataOperationResponse>()
                .Any(operation => operation.Name == DataKey && ValueMatches(operation.Value, prepared.DocumentHash));
            return containsExpectedHash
                ? new AnchorSubmission(NetworkName, prepared.TransactionHash, transaction.Ledger, true)
                : null;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch
        {
            return null;
        }
    }

    private KeyPair RequireSource()
        => _source ?? throw new InvalidOperationException(
            "Configure STELLAR_SECRET_SEED through external secret management to submit Testnet anchors.");

    private static bool ValueMatches(string? base64Value, string documentHash)
    {
        if (string.IsNullOrWhiteSpace(base64Value))
            return false;

        try
        {
            var value = Convert.FromBase64String(base64Value);
            var expected = Encoding.UTF8.GetBytes(documentHash.ToLowerInvariant());
            return CryptographicOperations.FixedTimeEquals(value, expected);
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static void EnsureSha256(string hash)
    {
        if (!IsSha256(hash))
            throw new ArgumentException("Expected a 64-character SHA-256 hexadecimal value.", nameof(hash));
    }

    private static bool IsSha256(string? hash)
        => hash is { Length: 64 } && hash.All(Uri.IsHexDigit);
}

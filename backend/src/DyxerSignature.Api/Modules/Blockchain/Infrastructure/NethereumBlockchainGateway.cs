using DyxerSignature.Api.Modules.Blockchain.Application;
using Microsoft.Extensions.Options;
using Nethereum.ABI.FunctionEncoding.Attributes;
using Nethereum.Contracts;
using Nethereum.Web3;
using Nethereum.Web3.Accounts;

namespace DyxerSignature.Api.Modules.Blockchain.Infrastructure;

[Function("anchorDocument")]
public sealed class AnchorDocumentFunction : FunctionMessage
{
    [Parameter("bytes32", "documentHash", 1)]
    public byte[] DocumentHash { get; init; } = [];

    [Parameter("bytes32", "evidenceHash", 2)]
    public byte[] EvidenceHash { get; init; } = [];
}

[Function("isAnchored", "bool")]
public sealed class IsAnchoredFunction : FunctionMessage
{
    [Parameter("bytes32", "documentHash", 1)]
    public byte[] DocumentHash { get; init; } = [];
}

public sealed class NethereumBlockchainGateway : IBlockchainGateway
{
    private readonly BlockchainOptions _options;
    private readonly Web3 _web3;

    public NethereumBlockchainGateway(IOptions<BlockchainOptions> options)
    {
        _options = options.Value;

        if (string.IsNullOrWhiteSpace(_options.PrivateKey))
            throw new InvalidOperationException("Blockchain private key is required in RPC mode.");
        if (string.IsNullOrWhiteSpace(_options.ContractAddress))
            throw new InvalidOperationException("Blockchain contract address is required in RPC mode.");

        var account = new Account(_options.PrivateKey, _options.ChainId);
        _web3 = new Web3(account, _options.RpcUrl);
    }

    public async Task<AnchorSubmission> AnchorDocumentAsync(
        string documentHash,
        string evidenceHash,
        CancellationToken cancellationToken)
    {
        var handler = _web3.Eth.GetContractHandler(_options.ContractAddress);
        var documentHashBytes = ParseHash(documentHash);

        var exists = await handler.QueryAsync<IsAnchoredFunction, bool>(
            new IsAnchoredFunction { DocumentHash = documentHashBytes });

        if (exists)
            return new AnchorSubmission(_options.ChainId, null, null, true);

        var receipt = await handler.SendRequestAndWaitForReceiptAsync(
            new AnchorDocumentFunction
            {
                DocumentHash = documentHashBytes,
                EvidenceHash = ParseHash(evidenceHash)
            });

        return new AnchorSubmission(
            _options.ChainId,
            receipt.TransactionHash,
            (long)receipt.BlockNumber.Value,
            false);
    }

    public async Task<AnchorVerification> VerifyDocumentAsync(
        string documentHash,
        CancellationToken cancellationToken)
    {
        var handler = _web3.Eth.GetContractHandler(_options.ContractAddress);
        var exists = await handler.QueryAsync<IsAnchoredFunction, bool>(
            new IsAnchoredFunction { DocumentHash = ParseHash(documentHash) });

        return new AnchorVerification(exists);
    }

    private static byte[] ParseHash(string hash)
    {
        var normalized = hash.StartsWith("0x", StringComparison.OrdinalIgnoreCase)
            ? hash[2..]
            : hash;

        if (normalized.Length != 64)
            throw new ArgumentException("Expected SHA-256 hexadecimal value.", nameof(hash));

        return Convert.FromHexString(normalized);
    }
}

using System.Security.Cryptography;
using System.Text;
using DyxerSignature.Api.Modules.Blockchain.Application;

namespace DyxerSignature.Api.Modules.Blockchain.Infrastructure;

public sealed class SimulatedBlockchainGateway : IBlockchainGateway
{
    private readonly HashSet<string> _anchors = new(StringComparer.OrdinalIgnoreCase);
    private long _blockNumber = 1;

    public Task<AnchorSubmission> AnchorDocumentAsync(
        string documentHash,
        string evidenceHash,
        CancellationToken cancellationToken)
    {
        var alreadyAnchored = !_anchors.Add(documentHash);
        if (alreadyAnchored)
            return Task.FromResult(new AnchorSubmission(31337, null, null, true));

        var txInput = Encoding.UTF8.GetBytes($"{documentHash}:{evidenceHash}:{_blockNumber}");
        var transactionHash = "0x" + Convert.ToHexString(SHA256.HashData(txInput)).ToLowerInvariant();
        var block = Interlocked.Increment(ref _blockNumber);

        return Task.FromResult(
            new AnchorSubmission(31337, transactionHash, block, false));
    }

    public Task<AnchorVerification> VerifyDocumentAsync(
        string documentHash,
        CancellationToken cancellationToken)
        => Task.FromResult(new AnchorVerification(_anchors.Contains(documentHash)));
}

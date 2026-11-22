using System.Security.Cryptography;
using System.Text;
using DyxerSignature.Api.Modules.Blockchain.Application;
using DyxerSignature.Api.Modules.Blockchain.Infrastructure;
using Microsoft.Extensions.Options;
using StellarDotnetSdk.Accounts;

using var keyPair = KeyPair.Random();
using var httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
var friendbotUrl = $"https://friendbot.stellar.org/?addr={Uri.EscapeDataString(keyPair.AccountId)}";
using var fundingResponse = await httpClient.GetAsync(friendbotUrl);
if (!fundingResponse.IsSuccessStatusCode)
    throw new InvalidOperationException($"Stellar Testnet Friendbot returned HTTP {(int)fundingResponse.StatusCode}.");

using var gateway = new StellarBlockchainGateway(Options.Create(new StellarOptions
{
    Network = "Testnet",
    HorizonUrl = "https://horizon-testnet.stellar.org",
    PublicKey = keyPair.AccountId,
    SecretSeed = keyPair.SecretSeed ?? throw new InvalidOperationException("Generated keypair has no secret seed.")
}));

var uniqueInput = Encoding.UTF8.GetBytes($"dyxersignature-testnet-smoke:{Guid.NewGuid():N}");
var documentHash = Convert.ToHexString(SHA256.HashData(uniqueInput)).ToLowerInvariant();
var prepared = await gateway.PrepareDocumentAsync(documentHash, CancellationToken.None);
var submission = await gateway.SubmitPreparedDocumentAsync(prepared, CancellationToken.None);
var verification = await gateway.VerifyDocumentAsync(
    documentHash,
    submission.TransactionHash,
    CancellationToken.None);

if (!verification.Exists)
    throw new InvalidOperationException("Stellar Testnet transaction did not verify the submitted SHA-256 value.");

Console.WriteLine($"NETWORK={submission.NetworkName}");
Console.WriteLine($"TRANSACTION_HASH={submission.TransactionHash}");
Console.WriteLine($"LEDGER={verification.LedgerNumber ?? submission.LedgerNumber}");
Console.WriteLine($"VERIFIED_SHA256={documentHash}");
Console.WriteLine($"HORIZON_URL=https://horizon-testnet.stellar.org/transactions/{submission.TransactionHash}");

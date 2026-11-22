using System.Security.Cryptography;
using System.Diagnostics;
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

// Keep the external measurement deliberately small. It measures real sequential
// Testnet confirmation latency without generating a high-volume network load.
const int sampleCount = 3;
var total = Stopwatch.StartNew();
var samples = new List<(string Hash, string TransactionHash, long? Ledger, double ElapsedMs)>();

for (var index = 0; index < sampleCount; index++)
{
    var uniqueInput = Encoding.UTF8.GetBytes($"dyxersignature-testnet-smoke:{Guid.NewGuid():N}");
    var documentHash = Convert.ToHexString(SHA256.HashData(uniqueInput)).ToLowerInvariant();
    var sample = Stopwatch.StartNew();
    var prepared = await gateway.PrepareDocumentAsync(documentHash, CancellationToken.None);
    var submission = await gateway.SubmitPreparedDocumentAsync(prepared, CancellationToken.None);
    var verification = await gateway.VerifyDocumentAsync(
        documentHash,
        submission.TransactionHash,
        CancellationToken.None);
    sample.Stop();

    if (!verification.Exists)
        throw new InvalidOperationException("Stellar Testnet transaction did not verify the submitted SHA-256 value.");

    samples.Add((documentHash, submission.TransactionHash, verification.LedgerNumber ?? submission.LedgerNumber, sample.Elapsed.TotalMilliseconds));
}

total.Stop();
Console.WriteLine("NETWORK=Stellar Testnet");
Console.WriteLine($"SAMPLE_COUNT={samples.Count}");
Console.WriteLine($"TOTAL_ELAPSED_MS={total.Elapsed.TotalMilliseconds:F0}");
Console.WriteLine($"VERIFIED_TRANSACTIONS_PER_SECOND={samples.Count / total.Elapsed.TotalSeconds:F3}");
for (var index = 0; index < samples.Count; index++)
{
    var sample = samples[index];
    Console.WriteLine($"SAMPLE_{index + 1}_ELAPSED_MS={sample.ElapsedMs:F0}");
    Console.WriteLine($"SAMPLE_{index + 1}_TRANSACTION_HASH={sample.TransactionHash}");
    Console.WriteLine($"SAMPLE_{index + 1}_LEDGER={sample.Ledger}");
    Console.WriteLine($"SAMPLE_{index + 1}_VERIFIED_SHA256={sample.Hash}");
    Console.WriteLine($"SAMPLE_{index + 1}_HORIZON_URL=https://horizon-testnet.stellar.org/transactions/{sample.TransactionHash}");
}


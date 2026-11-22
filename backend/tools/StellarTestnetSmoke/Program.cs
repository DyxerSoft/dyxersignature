using System.Security.Cryptography;
using System.Diagnostics;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using DyxerSignature.Api.Modules.Blockchain.Application;
using DyxerSignature.Api.Modules.Blockchain.Infrastructure;
using Microsoft.Extensions.Options;
using StellarDotnetSdk.Accounts;

if (args.Length == 2 && args[0] == "--provision-compose")
{
    await ProvisionComposeAccountAsync(args[1]);
    return;
}

if (args.Length == 2 && args[0] == "--api-e2e")
{
    await RunApiEndToEndAsync(args[1]);
    return;
}

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

static async Task ProvisionComposeAccountAsync(string githubEnvironmentFile)
{
    using var keyPair = KeyPair.Random();
    using var httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
    var friendbotUrl = $"https://friendbot.stellar.org/?addr={Uri.EscapeDataString(keyPair.AccountId)}";
    using var response = await httpClient.GetAsync(friendbotUrl);
    if (!response.IsSuccessStatusCode)
        throw new InvalidOperationException($"Stellar Testnet Friendbot returned HTTP {(int)response.StatusCode}.");

    var seed = keyPair.SecretSeed ?? throw new InvalidOperationException("Generated keypair has no secret seed.");
    Console.WriteLine($"::add-mask::{seed}");
    await File.AppendAllTextAsync(
        githubEnvironmentFile,
        $"STELLAR_PUBLIC_KEY={keyPair.AccountId}{Environment.NewLine}STELLAR_SECRET_SEED={seed}{Environment.NewLine}");
    Console.WriteLine("EPHEMERAL_TESTNET_ACCOUNT_FUNDED=true");
}

static async Task RunApiEndToEndAsync(string apiBaseUrl)
{
    using var client = new HttpClient
    {
        BaseAddress = new Uri(apiBaseUrl.TrimEnd('/') + "/", UriKind.Absolute),
        Timeout = TimeSpan.FromSeconds(30)
    };

    using var tokenResponse = await client.PostAsync("api/v1/auth/dev-token", content: null);
    using var tokenDocument = await ReadJsonAsync(tokenResponse);
    client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
        "Bearer",
        RequiredString(tokenDocument.RootElement, "accessToken"));

    var runReference = $"stellar-e2e-{Guid.NewGuid():N}";
    using var createResponse = await client.PostAsJsonAsync("api/v1/contracts", new
    {
        businessReference = runReference,
        title = "Synthetic Stellar Testnet smoke contract"
    });
    using var createDocument = await ReadJsonAsync(createResponse);
    var contractId = RequiredString(createDocument.RootElement, "id");

    var pdfBytes = Encoding.ASCII.GetBytes("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
    var firstVersion = await UploadAndSignVersionAsync(
        client,
        contractId,
        pdfBytes,
        correctionReason: null,
        signerName: "Synthetic Test Signer v1");
    var firstAnchor = await WaitForAnchorAsync(client, contractId, firstVersion.VersionId);

    var correctedPdfBytes = Encoding.ASCII.GetBytes("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 0 >>\nendobj\n%%EOF\n");
    var secondVersion = await UploadAndSignVersionAsync(
        client,
        contractId,
        correctedPdfBytes,
        correctionReason: "Synthetic Testnet correction",
        signerName: "Synthetic Test Signer v2");
    var secondAnchor = await WaitForAnchorAsync(client, contractId, secondVersion.VersionId);

    using var historyResponse = await client.GetAsync($"api/v1/contracts/{contractId}");
    using var historyDocument = await ReadJsonAsync(historyResponse);
    var versions = historyDocument.RootElement.GetProperty("versions");
    if (versions.GetArrayLength() != 2)
        throw new InvalidOperationException("The API did not preserve both immutable contract versions.");

    var firstHistory = FindVersion(versions, firstVersion.VersionId);
    var secondHistory = FindVersion(versions, secondVersion.VersionId);
    if (RequiredString(firstHistory, "status") != "Superseded" ||
        RequiredString(secondHistory, "status") != "Active")
    {
        throw new InvalidOperationException("The contract history did not retain the superseded and active versions.");
    }

    using var verifyResponse = await client.GetAsync(
        $"api/v1/contracts/{contractId}/versions/{secondVersion.VersionId}/verify");
    using var verifyDocument = await ReadJsonAsync(verifyResponse);
    var verification = verifyDocument.RootElement;
    if (!verification.GetProperty("verified").GetBoolean() ||
        !verification.GetProperty("contentMatches").GetBoolean() ||
        !verification.GetProperty("blockchain").GetProperty("verified").GetBoolean())
    {
        throw new InvalidOperationException("API verification did not match the stored PDF and Stellar Testnet anchor.");
    }

    using var linkResponse = await client.GetAsync($"api/v1/documents/{secondVersion.VersionId}/download");
    using var linkDocument = await ReadJsonAsync(linkResponse);
    var downloadUrl = RequiredString(linkDocument.RootElement, "downloadUrl");
    using var downloadClient = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
    using var downloadResponse = await downloadClient.GetAsync(downloadUrl);
    if (!downloadResponse.IsSuccessStatusCode)
        throw new InvalidOperationException($"Authorized S3 download returned HTTP {(int)downloadResponse.StatusCode}.");

    var downloadedBytes = await downloadResponse.Content.ReadAsByteArrayAsync();
    var downloadedHash = Convert.ToHexString(SHA256.HashData(downloadedBytes)).ToLowerInvariant();
    if (!downloadedBytes.SequenceEqual(correctedPdfBytes) || downloadedHash != secondVersion.DocumentHash)
        throw new InvalidOperationException("The downloaded private PDF did not match the signed version hash.");

    Console.WriteLine("NETWORK=Stellar Testnet through API Outbox");
    Console.WriteLine($"CONTRACT_ID={contractId}");
    Console.WriteLine("PRESERVED_VERSION_COUNT=2");
    Console.WriteLine($"VERSION_1_TRANSACTION_HASH={firstAnchor.TransactionHash}");
    Console.WriteLine($"VERSION_1_LEDGER={firstAnchor.LedgerNumber}");
    Console.WriteLine($"VERSION_1_HORIZON_URL=https://horizon-testnet.stellar.org/transactions/{firstAnchor.TransactionHash}");
    Console.WriteLine($"VERSION_2_SHA256={secondVersion.DocumentHash}");
    Console.WriteLine($"VERSION_2_TRANSACTION_HASH={secondAnchor.TransactionHash}");
    Console.WriteLine($"VERSION_2_LEDGER={secondAnchor.LedgerNumber}");
    Console.WriteLine($"VERSION_2_HORIZON_URL=https://horizon-testnet.stellar.org/transactions/{secondAnchor.TransactionHash}");
    Console.WriteLine($"DOWNLOAD_HTTP_STATUS={(int)downloadResponse.StatusCode}");
    Console.WriteLine($"DOWNLOADED_BYTES={downloadedBytes.Length}");
    Console.WriteLine("API_STELLAR_VERIFY=true");
    Console.WriteLine("API_STORED_CONTENT_VERIFY=true");
}

static async Task<(string VersionId, string DocumentHash)> UploadAndSignVersionAsync(
    HttpClient client,
    string contractId,
    byte[] pdfBytes,
    string? correctionReason,
    string signerName)
{
    using var form = new MultipartFormDataContent();
    form.Add(new ByteArrayContent(pdfBytes), "file", "synthetic-contract.pdf");
    if (correctionReason is not null)
        form.Add(new StringContent(correctionReason), "correctionReason");

    using var uploadResponse = await client.PostAsync($"api/v1/contracts/{contractId}/versions", form);
    using var uploadDocument = await ReadJsonAsync(uploadResponse);
    var versionId = RequiredString(uploadDocument.RootElement, "documentVersionId");
    var documentHash = RequiredString(uploadDocument.RootElement, "documentHash");

    using var reviewResponse = await client.PostAsJsonAsync(
        $"api/v1/contracts/{contractId}/versions/{versionId}/review",
        new { documentHash });
    EnsureSuccess(reviewResponse);

    using var signResponse = await client.PostAsJsonAsync(
        $"api/v1/contracts/{contractId}/versions/{versionId}/sign",
        new { documentHash, signerName });
    EnsureStatus(signResponse, System.Net.HttpStatusCode.Accepted);

    return (versionId, documentHash);
}

static async Task<(string TransactionHash, long LedgerNumber)> WaitForAnchorAsync(
    HttpClient client,
    string contractId,
    string versionId)
{
    var deadline = DateTimeOffset.UtcNow.AddMinutes(3);
    while (DateTimeOffset.UtcNow < deadline)
    {
        using var response = await client.GetAsync($"api/v1/contracts/{contractId}");
        using var document = await ReadJsonAsync(response);
        var version = FindVersion(document.RootElement.GetProperty("versions"), versionId);
        var blockchain = version.GetProperty("blockchain");
        var status = RequiredString(blockchain, "status");
        if (status == "Confirmed")
        {
            var transactionHash = RequiredString(blockchain, "transactionHash");
            var ledgerNumber = blockchain.GetProperty("ledgerNumber").GetInt64();
            return (transactionHash, ledgerNumber);
        }

        await Task.Delay(TimeSpan.FromSeconds(2));
    }

    throw new TimeoutException($"API Outbox did not confirm Stellar anchor for version {versionId} within three minutes.");
}

static JsonElement FindVersion(JsonElement versions, string versionId)
{
    foreach (var version in versions.EnumerateArray())
    {
        if (string.Equals(RequiredString(version, "id"), versionId, StringComparison.OrdinalIgnoreCase))
            return version;
    }

    throw new InvalidOperationException($"Version {versionId} was not present in contract history.");
}

static async Task<JsonDocument> ReadJsonAsync(HttpResponseMessage response)
{
    var body = await response.Content.ReadAsStringAsync();
    if (!response.IsSuccessStatusCode)
    {
        throw new InvalidOperationException(
            $"API returned HTTP {(int)response.StatusCode}: {body}");
    }

    return JsonDocument.Parse(body);
}

static string RequiredString(JsonElement element, string propertyName)
    => element.GetProperty(propertyName).GetString()
       ?? throw new InvalidOperationException($"API response property '{propertyName}' was null.");

static void EnsureSuccess(HttpResponseMessage response)
{
    if (!response.IsSuccessStatusCode)
        throw new InvalidOperationException($"API returned HTTP {(int)response.StatusCode}.");
}

static void EnsureStatus(HttpResponseMessage response, System.Net.HttpStatusCode expectedStatus)
{
    if (response.StatusCode != expectedStatus)
        throw new InvalidOperationException(
            $"API returned HTTP {(int)response.StatusCode}; expected {(int)expectedStatus}.");
}


using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using DyxerSignature.Api.Modules.Documents.Application;
using Microsoft.Extensions.Options;

namespace DyxerSignature.Api.Modules.Documents.Infrastructure;

public sealed class StorageOptions
{
    public string ServiceUrl { get; init; } = "http://localhost:8333";
    public string PublicServiceUrl { get; init; } = "http://localhost:8333";
    public string Region { get; init; } = "us-east-1";
    public string BucketName { get; init; } = "dyxersignature";
    public string AccessKey { get; init; } = "";
    public string SecretKey { get; init; } = "";
    public int PresignedUrlExpirationMinutes { get; init; } = 5;
}

/// <summary>
/// Stores immutable document objects in a private S3-compatible bucket.
/// Object keys include contract and version identity; no application API deletes objects.
/// </summary>
public sealed class S3DocumentStorage : IDocumentStorage, IDisposable
{
    private readonly StorageOptions _options;
    private readonly IAmazonS3 _internalClient;
    private readonly IAmazonS3 _publicSigningClient;

    public S3DocumentStorage(IOptions<StorageOptions> options)
    {
        _options = options.Value;
        if (string.IsNullOrWhiteSpace(_options.AccessKey) ||
            string.IsNullOrWhiteSpace(_options.SecretKey))
        {
            throw new InvalidOperationException("S3 credentials must be supplied through external configuration.");
        }

        _internalClient = CreateClient(_options.ServiceUrl);
        _publicSigningClient = CreateClient(_options.PublicServiceUrl);
    }

    public async Task<string> SavePdfAsync(
        Guid contractId,
        int versionNumber,
        Stream content,
        CancellationToken cancellationToken)
    {
        var key = $"contracts/{contractId:N}/versions/v{versionNumber}/{Guid.NewGuid():N}.pdf";
        var request = new PutObjectRequest
        {
            BucketName = _options.BucketName,
            Key = key,
            InputStream = content,
            ContentType = "application/pdf"
        };
        request.Headers.ContentDisposition = "attachment; filename=dyxersignature-document.pdf";
        request.Headers.CacheControl = "no-store";
        await _internalClient.PutObjectAsync(request, cancellationToken);

        return key;
    }

    public async Task<Stream> OpenReadAsync(
        string storageKey,
        CancellationToken cancellationToken)
    {
        ValidateStorageKey(storageKey);
        var response = await _internalClient.GetObjectAsync(new GetObjectRequest
        {
            BucketName = _options.BucketName,
            Key = storageKey
        }, cancellationToken);

        return response.ResponseStream;
    }

    public Task<string> GetPresignedReadUrlAsync(
        string storageKey,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ValidateStorageKey(storageKey);
        var url = _publicSigningClient.GetPreSignedURL(new GetPreSignedUrlRequest
        {
            BucketName = _options.BucketName,
            Key = storageKey,
            Verb = HttpVerb.GET,
            Expires = DateTime.UtcNow.AddMinutes(
                Math.Clamp(_options.PresignedUrlExpirationMinutes, 1, 15))
        });

        return Task.FromResult(url);
    }

    public void Dispose()
    {
        _internalClient.Dispose();
        _publicSigningClient.Dispose();
    }

    private IAmazonS3 CreateClient(string serviceUrl)
    {
        var config = new AmazonS3Config
        {
            ServiceURL = serviceUrl,
            ForcePathStyle = true,
            AuthenticationRegion = _options.Region
        };
        var credentials = new BasicAWSCredentials(_options.AccessKey, _options.SecretKey);
        return new AmazonS3Client(credentials, config);
    }

    private static void ValidateStorageKey(string key)
    {
        if (string.IsNullOrWhiteSpace(key) ||
            key.StartsWith('/') ||
            key.Contains("..", StringComparison.Ordinal) ||
            key.Contains('\\'))
        {
            throw new InvalidOperationException("Invalid storage key.");
        }
    }
}


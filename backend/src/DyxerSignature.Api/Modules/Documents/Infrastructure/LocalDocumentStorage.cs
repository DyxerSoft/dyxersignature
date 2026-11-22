using DyxerSignature.Api.Modules.Documents.Application;
using Microsoft.Extensions.Options;

namespace DyxerSignature.Api.Modules.Documents.Infrastructure;

public sealed class StorageOptions
{
    public string RootPath { get; init; } = ".data/documents";
}

public sealed class LocalDocumentStorage(IOptions<StorageOptions> options) : IDocumentStorage
{
    private readonly string _rootPath = Path.GetFullPath(options.Value.RootPath);

    public async Task<string> SaveSignedPdfAsync(
        Guid contractId,
        int versionNumber,
        Stream content,
        CancellationToken cancellationToken)
    {
        var relative = Path.Combine(
            contractId.ToString("N"),
            $"v{versionNumber}",
            $"{Guid.NewGuid():N}.pdf");

        var fullPath = Resolve(relative);
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);

        await using var output = new FileStream(
            fullPath,
            FileMode.CreateNew,
            FileAccess.Write,
            FileShare.None,
            81920,
            useAsync: true);

        await content.CopyToAsync(output, cancellationToken);
        return relative.Replace(Path.DirectorySeparatorChar, '/');
    }

    public Task<Stream> OpenReadAsync(string storageKey, CancellationToken cancellationToken)
    {
        Stream stream = new FileStream(
            Resolve(storageKey),
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            81920,
            useAsync: true);

        return Task.FromResult(stream);
    }

    public Task DeleteAsync(string storageKey, CancellationToken cancellationToken)
    {
        var fullPath = Resolve(storageKey);
        if (File.Exists(fullPath))
            File.Delete(fullPath);

        return Task.CompletedTask;
    }

    private string Resolve(string storageKey)
    {
        var normalized = storageKey.Replace('/', Path.DirectorySeparatorChar);
        var fullPath = Path.GetFullPath(Path.Combine(_rootPath, normalized));

        if (!fullPath.StartsWith(_rootPath, StringComparison.Ordinal))
            throw new InvalidOperationException("Invalid storage key.");

        return fullPath;
    }
}

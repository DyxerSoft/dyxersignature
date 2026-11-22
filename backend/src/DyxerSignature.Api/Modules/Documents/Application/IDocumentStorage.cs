namespace DyxerSignature.Api.Modules.Documents.Application;

public interface IDocumentStorage
{
    Task<string> SavePdfAsync(
        Guid contractId,
        int versionNumber,
        Stream content,
        CancellationToken cancellationToken);

    Task<Stream> OpenReadAsync(string storageKey, CancellationToken cancellationToken);

    Task<string> GetPresignedReadUrlAsync(
        string storageKey,
        CancellationToken cancellationToken);
}


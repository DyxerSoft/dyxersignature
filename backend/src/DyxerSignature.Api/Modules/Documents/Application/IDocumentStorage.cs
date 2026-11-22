namespace DyxerSignature.Api.Modules.Documents.Application;

public interface IDocumentStorage
{
    Task<string> SaveSignedPdfAsync(
        Guid contractId,
        int versionNumber,
        Stream content,
        CancellationToken cancellationToken);

    Task<string> SaveSignatureCropAsync(
        Guid contractId,
        Guid digitizationJobId,
        string signatureFileName,
        Stream content,
        CancellationToken cancellationToken);

    Task<string> SaveScanAsync(
        Guid contractId,
        Guid digitizationJobId,
        string fileName,
        Stream content,
        CancellationToken cancellationToken);

    Task<Stream> OpenReadAsync(string storageKey, CancellationToken cancellationToken);

    Task DeleteAsync(string storageKey, CancellationToken cancellationToken);
}

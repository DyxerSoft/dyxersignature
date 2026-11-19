using System.Security.Cryptography;

namespace DyxerSignature.Api.Modules.Documents.Application;

public sealed class DocumentIntegrityService
{
    private static readonly byte[] PdfHeader = "%PDF-"u8.ToArray();

    public async Task<bool> IsPdfAsync(Stream stream, CancellationToken cancellationToken)
    {
        var header = new byte[PdfHeader.Length];
        var read = await stream.ReadAsync(header, cancellationToken);
        return read == PdfHeader.Length && header.AsSpan().SequenceEqual(PdfHeader);
    }

    public async Task<string> ComputeSha256Async(Stream stream, CancellationToken cancellationToken)
    {
        using var sha256 = SHA256.Create();
        var hash = await sha256.ComputeHashAsync(stream, cancellationToken);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}

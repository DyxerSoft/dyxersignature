using System.Security.Cryptography;

namespace DyxerSignature.Api.Modules.Documents.Application;

public sealed class DocumentIntegrityService
{
    private static readonly byte[] PdfHeader = "%PDF-"u8.ToArray();

    public async Task<bool> IsPdfAsync(Stream stream, CancellationToken cancellationToken)
    {
        // Checking "%PDF-" alone allowed malformed test stubs to be stored and signed.
        // A conventional PDF must also contain a cross-reference offset and EOF marker.
        // This is a lightweight structural gate, not a substitute for full parsing.
        if (!stream.CanSeek || stream.Length < 64)
            return false;

        var originalPosition = stream.Position;
        try
        {
            stream.Position = 0;
            var header = new byte[PdfHeader.Length];
            if (await stream.ReadAsync(header, cancellationToken) != PdfHeader.Length ||
                !header.AsSpan().SequenceEqual(PdfHeader))
                return false;

            var tailSize = (int)Math.Min(4096L, stream.Length);
            stream.Seek(-tailSize, SeekOrigin.End);
            var tail = new byte[tailSize];
            await stream.ReadExactlyAsync(tail, cancellationToken);
            var text = System.Text.Encoding.Latin1.GetString(tail);
            var xrefPos = text.LastIndexOf("startxref", StringComparison.Ordinal);
            var eofPos = text.LastIndexOf("%%EOF", StringComparison.Ordinal);
            return xrefPos >= 0 && eofPos > xrefPos;
        }
        finally
        {
            stream.Position = originalPosition;
        }
    }

    public async Task<string> ComputeSha256Async(Stream stream, CancellationToken cancellationToken)
    {
        using var sha256 = SHA256.Create();
        var hash = await sha256.ComputeHashAsync(stream, cancellationToken);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}

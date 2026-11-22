using System.Text;
using DyxerSignature.Api.Modules.Documents.Application;
using Xunit;

namespace DyxerSignature.Api.Tests;

public sealed class DocumentIntegrityTests
{
    private readonly DocumentIntegrityService _integrity = new();

    [Fact]
    public async Task RejectsFakePdfHeaderWithoutCrossReferenceTable()
    {
        await using var input = new MemoryStream(
            Encoding.ASCII.GetBytes("%PDF-1.4\n% Not a real PDF\n%%EOF\n"));

        Assert.False(await _integrity.IsPdfAsync(input, CancellationToken.None));
    }

    [Fact]
    public async Task AcceptsPdfWithCrossReferenceOffsetAndPreservesPosition()
    {
        // Small ASCII fixture is sufficient for the inexpensive structural gate.
        // Full PDF rendering is covered by Playwright and the generated PDF fixture.
        var pdf = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"
            + "xref\n0 2\n0000000000 65535 f \n0000000009 00000 n \n"
            + "trailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n"
            + "45\n%%EOF\n";
        await using var input = new MemoryStream(Encoding.ASCII.GetBytes(pdf));
        input.Position = 3;

        Assert.True(await _integrity.IsPdfAsync(input, CancellationToken.None));
        Assert.Equal(3L, input.Position);
    }
}

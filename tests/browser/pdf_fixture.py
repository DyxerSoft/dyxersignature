"""Small, structurally valid one-page PDF for CI browser / load tests.

A fake '%PDF-' prefix is not a real PDF. This generator writes objects,
cross-reference offsets, trailer, startxref, and EOF; it uses only ASCII.
No real identity or client information.
"""


def valid_pdf_text(title: str = "Inmobiliaria Juanjo - Contrato de reserva") -> str:
    safe = "".join(ch for ch in title if ch.isascii() and ch not in "()\\")
    commands = f"BT /F1 14 Tf 54 700 Td ({safe}) Tj ET\n"
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        f"<< /Length {len(commands)} >>\nstream\n{commands}endstream",
    ]

    output = "%PDF-1.4\n"
    offsets = [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(output))
        output += f"{i} 0 obj\n{obj}\nendobj\n"

    xref_offset = len(output)
    output += f"xref\n0 {len(offsets)}\n0000000000 65535 f \n"
    for offset in offsets[1:]:
        output += f"{offset:010d} 00000 n \n"
    output += (
        f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\n"
        f"startxref\n{xref_offset}\n%%EOF\n"
    )
    return output

namespace DyxerSignature.Api.Modules.Blockchain.Application;

public sealed record AnchorDocumentOutboxPayload(
    Guid AnchorId,
    Guid ContractId,
    Guid DocumentVersionId,
    string? CorrectionReason);

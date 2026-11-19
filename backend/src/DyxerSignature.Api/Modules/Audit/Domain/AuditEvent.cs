namespace DyxerSignature.Api.Modules.Audit.Domain;

public sealed class AuditEvent
{
    private AuditEvent() { }

    public AuditEvent(
        Guid contractId,
        Guid? documentVersionId,
        string eventType,
        string actorType,
        string? actorId,
        string metadataJson,
        Guid correlationId)
    {
        Id = Guid.NewGuid();
        ContractId = contractId;
        DocumentVersionId = documentVersionId;
        EventType = eventType;
        ActorType = actorType;
        ActorId = actorId;
        MetadataJson = metadataJson;
        CorrelationId = correlationId;
        OccurredAtUtc = DateTimeOffset.UtcNow;
    }

    public Guid Id { get; private set; }
    public Guid ContractId { get; private set; }
    public Guid? DocumentVersionId { get; private set; }
    public string EventType { get; private set; } = null!;
    public string ActorType { get; private set; } = null!;
    public string? ActorId { get; private set; }
    public string MetadataJson { get; private set; } = "{}";
    public Guid CorrelationId { get; private set; }
    public DateTimeOffset OccurredAtUtc { get; private set; }
}

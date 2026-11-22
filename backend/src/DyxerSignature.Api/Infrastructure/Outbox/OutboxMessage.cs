namespace DyxerSignature.Api.Infrastructure.Outbox;

public sealed class OutboxMessage
{
    private OutboxMessage() { }

    public OutboxMessage(string type, string payloadJson, string? idempotencyKey = null)
    {
        Id = Guid.NewGuid();
        Type = type;
        PayloadJson = payloadJson;
        IdempotencyKey = idempotencyKey ?? Id.ToString("N");
        CreatedAtUtc = DateTimeOffset.UtcNow;
        NextAttemptAtUtc = CreatedAtUtc;
    }

    public Guid Id { get; private set; }
    public string Type { get; private set; } = null!;
    public string IdempotencyKey { get; private set; } = null!;
    public string PayloadJson { get; private set; } = null!;
    public int AttemptCount { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset NextAttemptAtUtc { get; private set; }
    public DateTimeOffset? CompletedAtUtc { get; private set; }
    public string? LastError { get; private set; }

    public void Complete()
    {
        CompletedAtUtc = DateTimeOffset.UtcNow;
        LastError = null;
    }

    public void ScheduleRetry(string error)
    {
        AttemptCount++;
        LastError = error.Length > 2000 ? error[..2000] : error;
        var seconds = Math.Min(60, Math.Pow(2, Math.Min(AttemptCount, 6)));
        NextAttemptAtUtc = DateTimeOffset.UtcNow.AddSeconds(seconds);
    }
}

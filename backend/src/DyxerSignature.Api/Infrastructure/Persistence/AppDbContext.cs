using DyxerSignature.Api.Infrastructure.Outbox;
using DyxerSignature.Api.Modules.Audit.Domain;
using DyxerSignature.Api.Modules.Blockchain.Domain;
using DyxerSignature.Api.Modules.Contracts.Domain;
using DyxerSignature.Api.Modules.Evidence.Domain;
using Microsoft.EntityFrameworkCore;

namespace DyxerSignature.Api.Infrastructure.Persistence;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options)
    : DbContext(options)
{
    public DbSet<Contract> Contracts => Set<Contract>();
    public DbSet<ContractDocumentVersion> ContractDocumentVersions => Set<ContractDocumentVersion>();
    public DbSet<BlockchainAnchor> BlockchainAnchors => Set<BlockchainAnchor>();
    public DbSet<EvidenceManifest> EvidenceManifests => Set<EvidenceManifest>();
    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();
    public DbSet<OutboxMessage> OutboxMessages => Set<OutboxMessage>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Contract>(entity =>
        {
            entity.ToTable("contracts");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.BusinessReference).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity.HasIndex(x => x.BusinessReference).IsUnique();
        });

        modelBuilder.Entity<ContractDocumentVersion>(entity =>
        {
            entity.ToTable("contract_document_versions");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(40);
            entity.Property(x => x.DocumentHash).HasMaxLength(64);
            entity.Property(x => x.StorageKey).HasMaxLength(500);
            entity.Property(x => x.CorrectionReason).HasMaxLength(500);

            entity.HasIndex(x => new { x.ContractId, x.VersionNumber }).IsUnique();

            entity.HasIndex(x => x.ContractId)
                .IsUnique()
                .HasFilter("\"Status\" = 'Active'");
        });

        modelBuilder.Entity<BlockchainAnchor>(entity =>
        {
            entity.ToTable("blockchain_anchors");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.DocumentHash).HasMaxLength(64).IsRequired();
            entity.Property(x => x.EvidenceHash).HasMaxLength(64).IsRequired();
            entity.Property(x => x.TransactionHash).HasMaxLength(80);
            entity.Property(x => x.LastError).HasMaxLength(2000);
            entity.HasIndex(x => x.DocumentVersionId).IsUnique();
            entity.HasIndex(x => x.DocumentHash).IsUnique();
        });

        modelBuilder.Entity<EvidenceManifest>(entity =>
        {
            entity.ToTable("evidence_manifests");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.EvidenceHash).HasMaxLength(64).IsRequired();
            entity.Property(x => x.CanonicalJson).HasColumnType("jsonb").IsRequired();
            entity.HasIndex(x => x.DocumentVersionId).IsUnique();
        });

        modelBuilder.Entity<AuditEvent>(entity =>
        {
            entity.ToTable("audit_events");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.EventType).HasMaxLength(100).IsRequired();
            entity.Property(x => x.ActorType).HasMaxLength(50).IsRequired();
            entity.Property(x => x.MetadataJson).HasColumnType("jsonb");
            entity.HasIndex(x => new { x.ContractId, x.OccurredAtUtc });
        });

        modelBuilder.Entity<OutboxMessage>(entity =>
        {
            entity.ToTable("outbox_messages");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Type).HasMaxLength(100).IsRequired();
            entity.Property(x => x.PayloadJson).HasColumnType("jsonb").IsRequired();
            entity.Property(x => x.LastError).HasMaxLength(2000);
            entity.HasIndex(x => new { x.CompletedAtUtc, x.NextAttemptAtUtc });
        });
    }
}

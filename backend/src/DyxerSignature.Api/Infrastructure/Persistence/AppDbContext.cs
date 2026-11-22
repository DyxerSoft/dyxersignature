using DyxerSignature.Api.Infrastructure.Outbox;
using DyxerSignature.Api.Modules.Audit.Domain;
using DyxerSignature.Api.Modules.Blockchain.Domain;
using DyxerSignature.Api.Modules.Contracts.Domain;
using DyxerSignature.Api.Modules.Evidence.Domain;
using DyxerSignature.Api.Modules.Signatures.Domain;
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
    public DbSet<SignatureEvent> SignatureEvents => Set<SignatureEvent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Contract>(entity =>
        {
            entity.ToTable("contracts");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.BusinessReference).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Title).HasMaxLength(200).IsRequired();
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity.HasIndex(x => x.BusinessReference).IsUnique();
            entity.HasIndex(x => x.DeletedAtUtc);
        });

        modelBuilder.Entity<ContractDocumentVersion>(entity =>
        {
            entity.ToTable("contract_document_versions");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(40);
            entity.Property(x => x.DocumentHash).HasMaxLength(64);
            entity.Property(x => x.StorageKey).HasMaxLength(500);
            entity.Property(x => x.CorrectionReason).HasMaxLength(500);

            entity.HasOne<Contract>()
                .WithMany()
                .HasForeignKey(x => x.ContractId)
                .OnDelete(DeleteBehavior.Restrict);
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
            entity.Property(x => x.NetworkName).HasMaxLength(64);
            entity.Property(x => x.TransactionHash).HasMaxLength(80);
            entity.Property(x => x.PreparedEnvelopeXdr).HasColumnType("text");
            entity.Property(x => x.LastError).HasMaxLength(2000);
            entity.HasOne<ContractDocumentVersion>()
                .WithMany()
                .HasForeignKey(x => x.DocumentVersionId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(x => x.DocumentVersionId).IsUnique();
            entity.HasIndex(x => x.DocumentHash);
        });

        modelBuilder.Entity<EvidenceManifest>(entity =>
        {
            entity.ToTable("evidence_manifests");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.EvidenceHash).HasMaxLength(64).IsRequired();
            entity.Property(x => x.CanonicalJson).HasColumnType("jsonb").IsRequired();
            entity.HasOne<ContractDocumentVersion>()
                .WithMany()
                .HasForeignKey(x => x.DocumentVersionId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(x => x.DocumentVersionId).IsUnique();
        });

        modelBuilder.Entity<AuditEvent>(entity =>
        {
            entity.ToTable("audit_events");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.EventType).HasMaxLength(100).IsRequired();
            entity.Property(x => x.ActorType).HasMaxLength(50).IsRequired();
            entity.Property(x => x.MetadataJson).HasColumnType("jsonb");
            entity.HasOne<Contract>()
                .WithMany()
                .HasForeignKey(x => x.ContractId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<ContractDocumentVersion>()
                .WithMany()
                .HasForeignKey(x => x.DocumentVersionId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(x => new { x.ContractId, x.OccurredAtUtc });
        });

        modelBuilder.Entity<OutboxMessage>(entity =>
        {
            entity.ToTable("outbox_messages");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Type).HasMaxLength(100).IsRequired();
            entity.Property(x => x.IdempotencyKey).HasMaxLength(120).IsRequired();
            entity.Property(x => x.PayloadJson).HasColumnType("jsonb").IsRequired();
            entity.Property(x => x.LastError).HasMaxLength(2000);
            entity.Property(x => x.ClaimToken);
            entity.HasIndex(x => new { x.CompletedAtUtc, x.NextAttemptAtUtc, x.ClaimedUntilUtc });
            entity.HasIndex(x => x.IdempotencyKey).IsUnique();
        });

        modelBuilder.Entity<SignatureEvent>(entity =>
        {
            entity.ToTable("signature_events");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.SignerName).HasMaxLength(200).IsRequired();
            entity.Property(x => x.SignerEmail).HasMaxLength(320);
            entity.Property(x => x.IpAddress).HasMaxLength(64);
            entity.Property(x => x.UserAgent).HasMaxLength(500);
            entity.Property(x => x.DocumentHash).HasMaxLength(64).IsRequired();
            entity.HasOne<Contract>()
                .WithMany()
                .HasForeignKey(x => x.ContractId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<ContractDocumentVersion>()
                .WithMany()
                .HasForeignKey(x => x.DocumentVersionId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(x => new { x.ContractId, x.SignedAtUtc });
            entity.HasIndex(x => x.DocumentVersionId);
        });
    }
}


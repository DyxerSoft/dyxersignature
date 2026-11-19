using DyxerSignature.Api.Modules.Audit.Domain;
using DyxerSignature.Api.Modules.Blockchain.Domain;
using DyxerSignature.Api.Modules.Contracts.Domain;
using Microsoft.EntityFrameworkCore;

namespace DyxerSignature.Api.Infrastructure.Persistence;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options)
    : DbContext(options)
{
    public DbSet<Contract> Contracts => Set<Contract>();
    public DbSet<ContractDocumentVersion> ContractDocumentVersions => Set<ContractDocumentVersion>();
    public DbSet<BlockchainAnchor> BlockchainAnchors => Set<BlockchainAnchor>();
    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();

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
            entity.HasIndex(x => x.DocumentVersionId).IsUnique();
            entity.HasIndex(x => x.DocumentHash).IsUnique();
        });

        modelBuilder.Entity<AuditEvent>(entity =>
        {
            entity.ToTable("audit_events");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.EventType).HasMaxLength(100).IsRequired();
            entity.Property(x => x.ActorType).HasMaxLength(50).IsRequired();
            entity.HasIndex(x => new { x.ContractId, x.OccurredAtUtc });
        });
    }
}

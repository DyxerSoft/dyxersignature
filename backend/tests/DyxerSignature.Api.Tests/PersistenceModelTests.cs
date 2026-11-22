using DyxerSignature.Api.Infrastructure.Persistence;
using DyxerSignature.Api.Modules.Audit.Domain;
using DyxerSignature.Api.Modules.Contracts.Domain;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace DyxerSignature.Api.Tests;

public sealed class PersistenceModelTests
{
    [Fact]
    public void AppendOnlyRecordsDeclareTheirExistingDatabaseForeignKeys()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=localhost;Database=dyxersignature_test;Username=test;Password=test")
            .Options;

        using var db = new AppDbContext(options);
        var auditType = db.Model.FindEntityType(typeof(AuditEvent));
        var versionType = db.Model.FindEntityType(typeof(ContractDocumentVersion));

        Assert.NotNull(auditType);
        Assert.NotNull(versionType);
        Assert.Contains(auditType!.GetForeignKeys(), foreignKey =>
            foreignKey.PrincipalEntityType.ClrType == typeof(Contract) &&
            foreignKey.Properties.Any(property => property.Name == nameof(AuditEvent.ContractId)));
        Assert.Contains(auditType.GetForeignKeys(), foreignKey =>
            foreignKey.PrincipalEntityType.ClrType == typeof(ContractDocumentVersion) &&
            foreignKey.Properties.Any(property => property.Name == nameof(AuditEvent.DocumentVersionId)));
        Assert.Contains(versionType!.GetForeignKeys(), foreignKey =>
            foreignKey.PrincipalEntityType.ClrType == typeof(Contract) &&
            foreignKey.Properties.Any(property => property.Name == nameof(ContractDocumentVersion.ContractId)));
    }
}


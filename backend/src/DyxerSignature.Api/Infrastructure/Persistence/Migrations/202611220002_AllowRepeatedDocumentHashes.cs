using DyxerSignature.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace DyxerSignature.Api.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("202611220002_AllowRepeatedDocumentHashes")]
public sealed class AllowRepeatedDocumentHashes : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE blockchain_anchors
                DROP CONSTRAINT IF EXISTS "blockchain_anchors_DocumentHash_key";
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE blockchain_anchors
                ADD CONSTRAINT "blockchain_anchors_DocumentHash_key" UNIQUE ("DocumentHash");
            """);
    }
}


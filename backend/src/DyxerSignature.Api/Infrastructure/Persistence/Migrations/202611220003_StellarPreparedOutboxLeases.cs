using DyxerSignature.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace DyxerSignature.Api.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("202611220003_StellarPreparedOutboxLeases")]
public sealed class StellarPreparedOutboxLeases : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE blockchain_anchors
                DROP COLUMN "ChainId",
                DROP COLUMN "BlockNumber",
                ADD COLUMN "NetworkName" varchar(64) NULL,
                ADD COLUMN "LedgerNumber" bigint NULL,
                ADD COLUMN "PreparedEnvelopeXdr" text NULL;

            ALTER TABLE outbox_messages
                ADD COLUMN "ClaimToken" uuid NULL,
                ADD COLUMN "ClaimedUntilUtc" timestamptz NULL;

            DROP INDEX IF EXISTS ix_outbox_due;
            CREATE INDEX ix_outbox_claim
                ON outbox_messages ("CompletedAtUtc", "NextAttemptAtUtc", "ClaimedUntilUtc");
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP INDEX IF EXISTS ix_outbox_claim;
            CREATE INDEX ix_outbox_due
                ON outbox_messages ("CompletedAtUtc", "NextAttemptAtUtc");

            ALTER TABLE outbox_messages
                DROP COLUMN "ClaimToken",
                DROP COLUMN "ClaimedUntilUtc";

            ALTER TABLE blockchain_anchors
                DROP COLUMN "NetworkName",
                DROP COLUMN "LedgerNumber",
                DROP COLUMN "PreparedEnvelopeXdr",
                ADD COLUMN "ChainId" bigint NULL,
                ADD COLUMN "BlockNumber" bigint NULL;
            """);
    }
}

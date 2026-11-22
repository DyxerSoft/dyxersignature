using DyxerSignature.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace DyxerSignature.Api.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("202611220001_InitialMvp")]
public sealed class InitialMvp : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE contracts (
                "Id" uuid PRIMARY KEY,
                "BusinessReference" varchar(100) NOT NULL UNIQUE,
                "Title" varchar(200) NOT NULL,
                "Status" varchar(32) NOT NULL,
                "CurrentVersionId" uuid NULL,
                "CreatedAtUtc" timestamptz NOT NULL,
                "UpdatedAtUtc" timestamptz NULL,
                "DeletedAtUtc" timestamptz NULL
            );
            CREATE INDEX ix_contracts_deleted_at ON contracts ("DeletedAtUtc");

            CREATE TABLE contract_document_versions (
                "Id" uuid PRIMARY KEY,
                "ContractId" uuid NOT NULL REFERENCES contracts ("Id") ON DELETE RESTRICT,
                "VersionNumber" integer NOT NULL,
                "PreviousVersionId" uuid NULL,
                "Status" varchar(40) NOT NULL,
                "StorageKey" varchar(500) NULL,
                "DocumentHash" varchar(64) NULL,
                "CorrectionReason" varchar(500) NULL,
                "CreatedAtUtc" timestamptz NOT NULL,
                "SignedAtUtc" timestamptz NULL,
                "SupersededAtUtc" timestamptz NULL,
                CONSTRAINT uq_contract_version_number UNIQUE ("ContractId", "VersionNumber")
            );
            CREATE UNIQUE INDEX uq_one_active_version_per_contract
                ON contract_document_versions ("ContractId") WHERE "Status" = 'Active';

            CREATE TABLE blockchain_anchors (
                "Id" uuid PRIMARY KEY,
                "DocumentVersionId" uuid NOT NULL UNIQUE REFERENCES contract_document_versions ("Id") ON DELETE RESTRICT,
                "DocumentHash" varchar(64) NOT NULL UNIQUE,
                "EvidenceHash" varchar(64) NOT NULL,
                "Status" varchar(32) NOT NULL,
                "ChainId" bigint NULL,
                "TransactionHash" varchar(80) NULL,
                "BlockNumber" bigint NULL,
                "RetryCount" integer NOT NULL DEFAULT 0,
                "LastError" varchar(2000) NULL,
                "CreatedAtUtc" timestamptz NOT NULL,
                "SubmittedAtUtc" timestamptz NULL,
                "ConfirmedAtUtc" timestamptz NULL
            );

            CREATE TABLE evidence_manifests (
                "Id" uuid PRIMARY KEY,
                "DocumentVersionId" uuid NOT NULL UNIQUE REFERENCES contract_document_versions ("Id") ON DELETE RESTRICT,
                "EvidenceHash" varchar(64) NOT NULL,
                "CanonicalJson" jsonb NOT NULL,
                "CreatedAtUtc" timestamptz NOT NULL
            );

            CREATE TABLE audit_events (
                "Id" uuid PRIMARY KEY,
                "ContractId" uuid NOT NULL REFERENCES contracts ("Id") ON DELETE RESTRICT,
                "DocumentVersionId" uuid NULL REFERENCES contract_document_versions ("Id") ON DELETE RESTRICT,
                "EventType" varchar(100) NOT NULL,
                "ActorType" varchar(50) NOT NULL,
                "ActorId" text NULL,
                "MetadataJson" jsonb NOT NULL,
                "CorrelationId" uuid NOT NULL,
                "OccurredAtUtc" timestamptz NOT NULL
            );
            CREATE INDEX ix_audit_events_contract_time
                ON audit_events ("ContractId", "OccurredAtUtc");

            CREATE TABLE outbox_messages (
                "Id" uuid PRIMARY KEY,
                "Type" varchar(100) NOT NULL,
                "IdempotencyKey" varchar(120) NOT NULL UNIQUE,
                "PayloadJson" jsonb NOT NULL,
                "AttemptCount" integer NOT NULL DEFAULT 0,
                "CreatedAtUtc" timestamptz NOT NULL,
                "NextAttemptAtUtc" timestamptz NOT NULL,
                "CompletedAtUtc" timestamptz NULL,
                "LastError" varchar(2000) NULL
            );
            CREATE INDEX ix_outbox_due
                ON outbox_messages ("CompletedAtUtc", "NextAttemptAtUtc");

            CREATE TABLE signature_events (
                "Id" uuid PRIMARY KEY,
                "ContractId" uuid NOT NULL REFERENCES contracts ("Id") ON DELETE RESTRICT,
                "DocumentVersionId" uuid NOT NULL REFERENCES contract_document_versions ("Id") ON DELETE RESTRICT,
                "SignerName" varchar(200) NOT NULL,
                "SignerEmail" varchar(320) NULL,
                "DocumentHash" varchar(64) NOT NULL,
                "IpAddress" varchar(64) NULL,
                "UserAgent" varchar(500) NULL,
                "SignedAtUtc" timestamptz NOT NULL
            );
            CREATE INDEX ix_signature_events_contract_time
                ON signature_events ("ContractId", "SignedAtUtc");
            CREATE INDEX ix_signature_events_version
                ON signature_events ("DocumentVersionId");
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP TABLE IF EXISTS signature_events;
            DROP TABLE IF EXISTS audit_events;
            DROP TABLE IF EXISTS outbox_messages;
            DROP TABLE IF EXISTS evidence_manifests;
            DROP TABLE IF EXISTS blockchain_anchors;
            DROP TABLE IF EXISTS contract_document_versions;
            DROP TABLE IF EXISTS contracts;
            """);
    }
}

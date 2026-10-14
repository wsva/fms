-- Phase 7b: dataset-scope journal authority (sync-v2.md §4/§5/§7, INV-1/13/20).
--
-- The website already MINTS `@app`-scope seqs (app_sync_seq) and STORES the hub's
-- dataset-scope seqs verbatim (mirror fill, app_sync_log with PK
-- (cluster_id, scope, seq)). Phase 7b lets it MINT a dataset scope's journal too,
-- for accounts that host a scope (dataset.journal_role='authority'). Two columns
-- on the catalog carry the role + handover epoch; a new per-scope counter mints
-- the seqs. Nothing here changes the @app path or the mirror path's storage.
--
-- journal_role defaults 'mirror', so every existing dataset keeps today's
-- behaviour (mirror store + verbatim hub seq) — activation is an explicit flip.
-- journal_epoch defaults 0 and is only surfaced in mirror refusals; no handover
-- export/import bumps it yet, so the value is inert but reserved.
--
-- dataset_sync_seq is self-seeded by nextDatasetSeq to MAX(app_sync_log.seq for
-- that scope)+1 on first mint, so taking over an already-mirrored scope continues
-- its sequence rather than colliding at 1 (§3-fact-2's two number spaces, one PK).
--
-- Production runbook (never `db push` / `migrate deploy`):
--   psql -f <this file>
--   prisma migrate resolve --applied 20261013220000_add_dataset_journal_authority
--   deploy the new bundle

ALTER TABLE "dataset" ADD COLUMN "journal_role" VARCHAR(10) NOT NULL DEFAULT 'mirror';
ALTER TABLE "dataset" ADD COLUMN "journal_epoch" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "dataset_sync_seq" (
    "cluster_id" VARCHAR(320) NOT NULL,
    "scope"      VARCHAR(100) NOT NULL,
    "next_seq"   BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT "dataset_sync_seq_pkey" PRIMARY KEY ("cluster_id", "scope")
);

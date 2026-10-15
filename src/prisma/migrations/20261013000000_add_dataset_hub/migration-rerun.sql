-- website sync-v2 — squashed migration, RE-RUN variant.
--
-- Same target schema as ./migration.sql, reshaped so it can be applied to a database
-- that has ALREADY been through it. Two transformations only:
--   1. every `ALTER TABLE ... ADD COLUMN` that this file makes against a table this
--      file also CREATEs is folded into that CREATE TABLE, in the order the columns
--      were historically added (dataset.current_version / journal_role / journal_epoch,
--      dataset_version.available) and placed among the business columns rather than
--      after the `created_at`/`updated_at` pair an ALTER had pushed them past;
--   2. every table and index this file CREATEs is dropped first (`IF EXISTS`), so a
--      replay never trips "already exists".
--
-- Consequence, stated plainly: this file DESTROYS the rows of every table it recreates
-- — the dataset catalog, all versions/hashes/tags, the whole @app journal and its
-- projections, the inbox queue, the seq counters and the blob ledger. It is for a
-- scratch database or a deliberate from-scratch rebuild, NOT for production. The
-- ordinary ./migration.sql is the one that preserves data; run that instead unless the
-- operator has explicitly asked to rebuild these tables.
--
-- `dataset_subscription` is the one table this file ALTERS but never CREATEs (it comes
-- from `db push`, not from any migration). Dropping it would delete user subscriptions
-- with nothing here to recreate them, so it stays untouched and only its idempotent
-- alterations run — which is why its ADD COLUMN uses IF NOT EXISTS and the legacy unique
-- is dropped in both shapes.
--
-- Runbook (never `db push` / `migrate deploy` — the local schema.prisma omits prod-only
-- tables, and the migrations folder is not replayable from empty):
--   psql -f src/prisma/migrations/20261013000000_add_dataset_hub/migration-rerun.sql
-- The `_prisma_migrations` row for 20261013000000_add_dataset_hub is unchanged by a
-- rerun; re-resolve it only if that row itself is missing:
--   prisma migrate resolve --applied 20261013000000_add_dataset_hub

--------------------------------------------------------------------------------
-- Drop preamble: everything this file recreates, reverse creation order.
-- A table's own indexes and primary key go with it, so the only index needing an
-- explicit drop is the one living on a table that survives (dataset_subscription).
--------------------------------------------------------------------------------

DROP TABLE IF EXISTS "dataset_blob_path";
DROP TABLE IF EXISTS "dataset_blob";
DROP TABLE IF EXISTS "dataset_sync_seq";
DROP TABLE IF EXISTS "app_read_attempt_event";
DROP TABLE IF EXISTS "app_inbox";
DROP TABLE IF EXISTS "app_inbox_seq";
DROP TABLE IF EXISTS "app_card_review_event";
DROP TABLE IF EXISTS "app_xp_ledger";
DROP TABLE IF EXISTS "app_dictation";
DROP TABLE IF EXISTS "app_sync_prune_mark";
DROP TABLE IF EXISTS "app_applied_change";
DROP TABLE IF EXISTS "app_sync_log";
DROP TABLE IF EXISTS "app_sync_seq";
DROP TABLE IF EXISTS "read_chapter_progress";
DROP TABLE IF EXISTS "dataset_tag_link";
DROP TABLE IF EXISTS "dataset_file_hash";
DROP TABLE IF EXISTS "dataset_version";
DROP TABLE IF EXISTS "dataset";

-- DropIndex: legacy unique over (user_id, tag_uuid). Older deployments created it
-- as a table constraint, newer ones as a plain unique index, so drop both shapes.
ALTER TABLE "dataset_subscription" DROP CONSTRAINT IF EXISTS "dataset_subscription_user_id_tag_uuid_key";
DROP INDEX IF EXISTS "dataset_subscription_user_id_tag_uuid_key";

-- DropIndex: this file's replacement unique, so the CREATE below is replay-safe.
DROP INDEX IF EXISTS "dataset_subscription_user_id_dataset_uuid_key";


--------------------------------------------------------------------------------
-- Dataset hub catalog. `dataset_subscription` re-points from tags to dataset
-- directories; the catalog table carries the registry pin (current_version) and the
-- phase-7b journal role/epoch that migration.sql added by ALTER.
--------------------------------------------------------------------------------

-- AlterTable: subscription re-pointed from tags to dataset directories
ALTER TABLE "dataset_subscription" ALTER COLUMN "tag_uuid" DROP NOT NULL;
ALTER TABLE "dataset_subscription" ADD COLUMN IF NOT EXISTS "dataset_uuid" VARCHAR(100);

-- CreateIndex: new unique over (user_id, dataset_uuid); NULL dataset_uuid rows stay distinct
CREATE UNIQUE INDEX "dataset_subscription_user_id_dataset_uuid_key" ON "dataset_subscription"("user_id", "dataset_uuid");

-- CreateTable: dataset directory catalog (one row per dataset, current version)
CREATE TABLE "dataset" (
    "uuid" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(100) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "dataset_type" VARCHAR(20) NOT NULL,
    "format" VARCHAR(40) NOT NULL,
    "language" VARCHAR(10) NOT NULL DEFAULT '',
    "spec" INTEGER NOT NULL DEFAULT 2,
    "visibility" VARCHAR(10) NOT NULL DEFAULT 'private',
    "extra" JSONB,
    "info_created_at" VARCHAR(32),
    "info_updated_at" VARCHAR(32),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ready',
    "archive_path" TEXT,
    "archive_sha256" VARCHAR(64),
    "archive_size" BIGINT,
    "file_count" INTEGER NOT NULL DEFAULT 0,
    "total_bytes" BIGINT NOT NULL DEFAULT 0,
    "overall_hash" VARCHAR(64),
    "snapshot_seq" BIGINT NOT NULL DEFAULT 0,
    "media_count" INTEGER NOT NULL DEFAULT 0,
    "card_count" INTEGER NOT NULL DEFAULT 0,
    "deleted" VARCHAR(1) NOT NULL DEFAULT 'N',
    -- published pin for the registry plane (sync-v2 §7/§8.4, INV-8/INV-17): registry
    -- reads resolve to this version instead of the mutable live dir; NULL means nothing
    -- is published, so those reads 404.
    "current_version" INTEGER,
    -- phase 7b (sync-v2 §4/§5/§7, INV-1/13/20): journal role + handover epoch.
    -- journal_role defaults 'mirror', so a fresh dataset keeps today's behaviour
    -- (mirror store + verbatim hub seq) — activation is an explicit flip.
    -- journal_epoch defaults 0 and is only surfaced in mirror refusals.
    "journal_role" VARCHAR(10) NOT NULL DEFAULT 'mirror',
    "journal_epoch" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dataset_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable: immutable per-version upload record
CREATE TABLE "dataset_version" (
    "uuid" VARCHAR(100) NOT NULL,
    "dataset_uuid" VARCHAR(100) NOT NULL,
    "version" INTEGER NOT NULL,
    "archive_path" TEXT NOT NULL,
    "archive_sha256" VARCHAR(64) NOT NULL,
    "archive_size" BIGINT NOT NULL,
    "file_count" INTEGER NOT NULL DEFAULT 0,
    "total_bytes" BIGINT NOT NULL DEFAULT 0,
    "overall_hash" VARCHAR(64),
    "info_updated_at" VARCHAR(32),
    -- published-version availability for the takedown primitive (sync-v2 §11.5).
    -- 'Y'/'N' matches the catalog's `deleted` convention. This is the ONLY sanctioned
    -- metadata mutation of an otherwise immutable `versions/` entry (INV-8): the bytes
    -- are never touched here. A version marked 'N' makes registry reads return 410 Gone
    -- and the read-time pin resolve to the next-lower available version;
    -- `dataset.current_version` is deliberately NOT rewritten by a takedown (INV-17),
    -- so an overturned takedown restores the exact prior state by flipping back to 'Y'.
    "available" VARCHAR(1) NOT NULL DEFAULT 'Y',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dataset_version_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable: manifest per-file hash cache
CREATE TABLE "dataset_file_hash" (
    "dataset_uuid" VARCHAR(100) NOT NULL,
    "path" VARCHAR(1024) NOT NULL,
    "size" BIGINT NOT NULL,
    "mtime" BIGINT NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    CONSTRAINT "dataset_file_hash_pkey" PRIMARY KEY ("dataset_uuid", "path")
);

-- CreateTable: dataset-to-tag grouping links
CREATE TABLE "dataset_tag_link" (
    "uuid" VARCHAR(100) NOT NULL,
    "dataset_uuid" VARCHAR(100) NOT NULL,
    "tag_uuid" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dataset_tag_link_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE INDEX "dataset_dataset_type_idx" ON "dataset"("dataset_type");

-- CreateIndex
CREATE INDEX "dataset_visibility_deleted_idx" ON "dataset"("visibility", "deleted");

-- CreateIndex
CREATE INDEX "dataset_user_id_idx" ON "dataset"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_version_dataset_uuid_version_key" ON "dataset_version"("dataset_uuid", "version");

-- CreateIndex
CREATE INDEX "dataset_version_dataset_uuid_idx" ON "dataset_version"("dataset_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_tag_link_dataset_uuid_tag_uuid_key" ON "dataset_tag_link"("dataset_uuid", "tag_uuid");

-- CreateIndex
CREATE INDEX "dataset_tag_link_tag_uuid_idx" ON "dataset_tag_link"("tag_uuid");


-- CreateTable
CREATE TABLE "read_chapter_progress" (
    "uuid" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(100) NOT NULL,
    "dataset_uuid" VARCHAR(100) NOT NULL,
    "chapter_uuid" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "read_chapter_progress_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "read_chapter_progress_user_id_dataset_uuid_chapter_uuid_key" ON "read_chapter_progress"("user_id", "dataset_uuid", "chapter_uuid");


--------------------------------------------------------------------------------
-- Phase 7a: website as the `@app`-scope cloud journal authority (sync-v2.md §16).
-- Per-cluster tables (cluster_id = account email; one cloud cluster per account).
-- The journal mirrors the desktop hub's `sync_log` / `applied_changes` /
-- `sync_prune_marks`, plus one projection table per @app kind so the website UI
-- (phase 6) and `/app/state` read the same rows a change writes (INV-18).
--------------------------------------------------------------------------------

-- Per-cluster seq minter: `seq` is monotonic *within a cluster*, not globally,
-- because one Postgres serves every account. Advanced under a per-cluster
-- advisory xact lock (sync-v2.md §11.2) so appends serialize across instances.
CREATE TABLE "app_sync_seq" (
    "cluster_id" VARCHAR(320) NOT NULL,
    "next_seq" BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT "app_sync_seq_pkey" PRIMARY KEY ("cluster_id")
);

-- Append-only change journal for the `@app` scope (dictation, xp, card_review).
-- The PK is already the phase-4 widening to (cluster_id, scope, seq): the website
-- MINTS `@app`-scope seqs here and a mirror fill STORES the hub's dataset-scope seqs
-- under the same cluster_id (§0, §8.2, §14 step 4). Both number spaces start at 1, so
-- the old (cluster_id, seq) PK would collide — §3-fact-2 / §6.1's "two number spaces".
-- migration.sql widened it by ALTER; here it is simply declared, which also makes the
-- secondary (cluster_id, scope, seq) index it once created redundant — the PK covers it.
CREATE TABLE "app_sync_log" (
    "cluster_id" VARCHAR(320) NOT NULL,
    "seq" BIGINT NOT NULL,
    "scope" VARCHAR(100) NOT NULL,
    "object_id" TEXT NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "op" VARCHAR(10) NOT NULL,
    "edit_time" VARCHAR(64) NOT NULL DEFAULT '',
    "user_key" VARCHAR(320) NOT NULL DEFAULT '',
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_sync_log_pkey" PRIMARY KEY ("cluster_id", "scope", "seq")
);

-- Replay dedup ledger (INV-3): a lost ack makes the follower re-send the same
-- change_id; the hub must apply it once. Keyed per cluster so one account's id can
-- never shadow another's. Pruned by applied_at, never by edit_time.
CREATE TABLE "app_applied_change" (
    "cluster_id" VARCHAR(320) NOT NULL,
    "change_id" VARCHAR(128) NOT NULL,
    "applied_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_applied_change_pkey" PRIMARY KEY ("cluster_id", "change_id")
);

-- Retention high-water mark per (cluster, scope). A follower cursoring below it
-- has an unrecoverable gap and is told `resync_required` on its next pull.
CREATE TABLE "app_sync_prune_mark" (
    "cluster_id" VARCHAR(320) NOT NULL,
    "scope" VARCHAR(100) NOT NULL,
    "pruned_up_to" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "app_sync_prune_mark_pkey" PRIMARY KEY ("cluster_id", "scope")
);

-- dictation progress projection (State, later-edit_time-wins). `completed` is a
-- String on the wire (`ListenDictation.completed`), so it stays TEXT here.
CREATE TABLE "app_dictation" (
    "id" BIGSERIAL NOT NULL,
    "cluster_id" VARCHAR(320) NOT NULL,
    "media_uuid" VARCHAR(100) NOT NULL,
    "subtitle_uuid" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT '',
    "completed" TEXT NOT NULL DEFAULT '',
    "edit_time" VARCHAR(64) NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_dictation_pkey" PRIMARY KEY ("id")
);

-- XP ledger (Counter): one delta row per award; lifetime_xp = SUM(amount)
-- (INV-16, recomputed, never accumulated). The unique key is exactly the dedup
-- key the app's `xp_award_internal` checks, so a replayed award is a no-op.
CREATE TABLE "app_xp_ledger" (
    "id" BIGSERIAL NOT NULL,
    "cluster_id" VARCHAR(320) NOT NULL,
    "amount" BIGINT NOT NULL,
    "source" VARCHAR(60) NOT NULL DEFAULT '',
    "reference_id" VARCHAR(128) NOT NULL DEFAULT '',
    "dataset_uuid" VARCHAR(100) NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_xp_ledger_pkey" PRIMARY KEY ("id")
);

-- card-review results (AppendOnly; INV-21 non-prunable). One stored result per
-- rating, keyed by the author's event_uuid so a replayed event is inserted once.
CREATE TABLE "app_card_review_event" (
    "id" BIGSERIAL NOT NULL,
    "cluster_id" VARCHAR(320) NOT NULL,
    "event_uuid" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(320) NOT NULL DEFAULT '',
    "dataset_uuid" VARCHAR(100) NOT NULL DEFAULT '',
    "card_uuid" VARCHAR(100) NOT NULL,
    "quality" INTEGER,
    "reviewed_at" VARCHAR(64),
    "familiarity" INTEGER NOT NULL DEFAULT 0,
    "interval_days" INTEGER NOT NULL DEFAULT 0,
    "ease_factor" INTEGER NOT NULL DEFAULT 250,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "next_review_at" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_card_review_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_applied_change_cluster_id_applied_at_idx" ON "app_applied_change"("cluster_id", "applied_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_dictation_cluster_id_media_uuid_subtitle_uuid_key" ON "app_dictation"("cluster_id", "media_uuid", "subtitle_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "app_xp_ledger_cluster_id_source_reference_id_dataset_uuid_key" ON "app_xp_ledger"("cluster_id", "source", "reference_id", "dataset_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "app_card_review_event_cluster_id_event_uuid_key" ON "app_card_review_event"("cluster_id", "event_uuid");


-- Backfill: pin every existing non-deleted dataset to its newest uploaded version so
-- current shares stay adoptable once `registry_reads` is advertised. Going forward only
-- an explicit publish moves the pin.
--
-- On a rerun this matches zero rows — `dataset` and `dataset_version` were both just
-- rebuilt empty — but it is kept verbatim so this file and ./migration.sql express the
-- same intent and stay diffable against each other.
UPDATE "dataset" d
   SET "current_version" = (
        SELECT MAX(v."version") FROM "dataset_version" v WHERE v."dataset_uuid" = d."uuid"
   )
 WHERE d."deleted" = 'N'
   AND d."current_version" IS NULL
   AND EXISTS (SELECT 1 FROM "dataset_version" v WHERE v."dataset_uuid" = d."uuid");


--------------------------------------------------------------------------------
-- Phase 5: website as the Inbox host (sync-v2.md §6.3, §8.3, §14 step 5).
-- The website HOSTS proposals from editors without the journal (the website UI;
-- optionally an offline follower); the desktop authority drains them, applies via
-- its command path (INV-18, minting the real journal seq THERE), and acks
-- accepted[]/rejected[{winner_seq, winner_payload}] (INV-4). The website mints NO
-- journal seq (INV-1): proposal_seq is an inbox-ordering counter per
-- (cluster, scope), not a journal position. These routes write ONLY these two
-- tables — never app_sync_log, the dataset catalog, current_version, snapshot_seq,
-- or versions/ (INV-2, INV-17).
--------------------------------------------------------------------------------

-- Inbox proposal-ordering counter, per (cluster, scope). A SEPARATE number space
-- from app_sync_seq: proposal_seq orders the queue, it is never a journal seq.
CREATE TABLE "app_inbox_seq" (
    "cluster_id" VARCHAR(320) NOT NULL,
    "scope" VARCHAR(100) NOT NULL,
    "next_seq" BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT "app_inbox_seq_pkey" PRIMARY KEY ("cluster_id", "scope")
);

-- Inbox proposal queue. A QUEUE with a lifecycle (pending -> accepted | rejected),
-- NOT an append-only journal. `change_id` is the INV-3 dedup key; `winner_seq` /
-- `winner_payload` are the INV-4 rollback material set on ack.
CREATE TABLE "app_inbox" (
    "cluster_id" VARCHAR(320) NOT NULL,
    "scope" VARCHAR(100) NOT NULL,
    "proposal_seq" BIGINT NOT NULL,
    "change_id" VARCHAR(128) NOT NULL,
    "object_id" TEXT NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "op" VARCHAR(10) NOT NULL,
    "edit_time" VARCHAR(64) NOT NULL DEFAULT '',
    "author" VARCHAR(320) NOT NULL DEFAULT '',
    "payload" JSONB NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "winner_seq" BIGINT,
    "winner_payload" JSONB,
    "acked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_inbox_pkey" PRIMARY KEY ("cluster_id", "scope", "proposal_seq")
);

-- CreateIndex
CREATE INDEX "app_inbox_cluster_id_scope_status_proposal_seq_idx" ON "app_inbox"("cluster_id", "scope", "status", "proposal_seq");

-- CreateIndex
CREATE UNIQUE INDEX "app_inbox_cluster_id_change_id_key" ON "app_inbox"("cluster_id", "change_id");


--------------------------------------------------------------------------------
-- Phase 7a parity: read-aloud attempt events on the website's `@app` cloud authority
-- (sync-v2.md §17.6 item 3, §14 protocol-version note). Protocol v6 grows
-- GET /api/v1/app/state from two tables to four — dictation + xp (v4) plus
-- card_review_event + read_attempt_event (v6) — each paged by rowid per identity,
-- so a cloud `@app` authority becomes exit-lossless for practice history (INV-21).
--
-- This table is the projection for journal kind `read_attempt_save`: one row per
-- attempt carrying its outcome (INV-23). The unique key (cluster_id, uuid) makes a
-- replayed event an INSERT-once no-op, mirroring the app's `INSERT OR IGNORE INTO
-- read_attempt_event` keyed by its uuid PK. Kind `read_attempt_delete` removes the
-- owner's row here (journal-only delete; no dataset tombstone — the recording is
-- device-local and `audio_path` never points at website bytes).
--
-- Column naming: `created_at` is the WIRE attempt stamp from `attempt_payload`
-- (canonical fixed-width UTC per INV-6), NOT the ingest time — that is
-- `inserted_at`. The column keeps the wire name so the payload/state mapping stays
-- 1:1 with the app's `read_attempt_event`.
--------------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "app_read_attempt_event" (
    "id" BIGSERIAL NOT NULL,
    "cluster_id" VARCHAR(320) NOT NULL,
    "uuid" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(320) NOT NULL DEFAULT '',
    "dataset_uuid" VARCHAR(100) NOT NULL DEFAULT '',
    "text_uuid" VARCHAR(100) NOT NULL DEFAULT '',
    "audio_path" TEXT,
    "recognized" TEXT NOT NULL DEFAULT '',
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" VARCHAR(64) NOT NULL DEFAULT '',
    "inserted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_read_attempt_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_read_attempt_event_cluster_id_uuid_key" ON "app_read_attempt_event"("cluster_id", "uuid");


--------------------------------------------------------------------------------
-- Phase 7b: dataset-scope journal authority (sync-v2.md §4/§5/§7, INV-1/13/20).
--
-- The website already MINTS `@app`-scope seqs (app_sync_seq) and STORES the hub's
-- dataset-scope seqs verbatim (mirror fill, app_sync_log with PK
-- (cluster_id, scope, seq)). Phase 7b lets it MINT a dataset scope's journal too,
-- for accounts that host a scope (dataset.journal_role='authority'); the role/epoch
-- columns now live in the `dataset` CREATE above.
--
-- dataset_sync_seq is self-seeded by nextDatasetSeq to MAX(app_sync_log.seq for
-- that scope)+1 on first mint, so taking over an already-mirrored scope continues
-- its sequence rather than colliding at 1 (§3-fact-2's two number spaces, one PK).
--------------------------------------------------------------------------------

CREATE TABLE "dataset_sync_seq" (
    "cluster_id" VARCHAR(320) NOT NULL,
    "scope"      VARCHAR(100) NOT NULL,
    "next_seq"   BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT "dataset_sync_seq_pkey" PRIMARY KEY ("cluster_id", "scope")
);


--------------------------------------------------------------------------------
-- Phase 4: content-addressed blob store + changed-file transport (sync-v2.md §7).
--
-- The whole-archive upload (POST /api/dataset/upload) stays for bootstrap and
-- explicit publish (§12:299). This adds the plane the doc defers as "changed-file
-- transport + content-addressed blob store": a dataset's live tree is recorded as
-- (path -> sha256) rows, and every distinct hash is stored once, shared across all
-- datasets and versions (§7:197 "de-duplicates across versions").
--
-- dataset_blob is the global content ledger: one row per distinct sha256, with a
-- refcount of how many live-tree rows name it. Bytes live on disk at
-- BLOB_ROOT/<sha[0:2]>/<sha> (see lib/sync/blobstore.ts); this row is the DB fact.
-- refcount defaults 0 so a fresh blob row is inert until the live swap raises it.
--
-- dataset_blob_path is one dataset's live tree. The changed-file diff (POST
-- /api/v1/datasets/{uuid}/objects) is computed against it, so an unchanged re-push
-- uploads zero bytes. DB files never land here — their content churns through card
-- sync, not the blob plane (manifest isDbFile).
--
-- This table pair is what a rerun silently desynchronises: the rows go, the blobs on
-- disk stay. Reconciliation is an operator action (the refcount-0 GC the doc allows),
-- not something this file attempts.
--------------------------------------------------------------------------------

CREATE TABLE "dataset_blob" (
    "sha256"     VARCHAR(64) NOT NULL,
    "size"       BIGINT NOT NULL,
    "refcount"   INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dataset_blob_pkey" PRIMARY KEY ("sha256")
);

CREATE TABLE "dataset_blob_path" (
    "dataset_uuid" VARCHAR(100) NOT NULL,
    "path"         VARCHAR(1024) NOT NULL,
    "sha256"       VARCHAR(64) NOT NULL,
    "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dataset_blob_path_pkey" PRIMARY KEY ("dataset_uuid", "path")
);

CREATE INDEX "dataset_blob_path_dataset_uuid_idx" ON "dataset_blob_path"("dataset_uuid");

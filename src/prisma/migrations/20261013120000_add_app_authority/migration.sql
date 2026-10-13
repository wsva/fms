-- Phase 7a: website as the `@app`-scope cloud journal authority (sync-v2.md §16).
-- Per-cluster tables (cluster_id = account email; one cloud cluster per account).
-- The journal mirrors the desktop hub's `sync_log` / `applied_changes` /
-- `sync_prune_marks`, plus one projection table per @app kind so the website UI
-- (phase 6) and `/app/state` read the same rows a change writes (INV-18).

-- Per-cluster seq minter: `seq` is monotonic *within a cluster*, not globally,
-- because one Postgres serves every account. Advanced under a per-cluster
-- advisory xact lock (sync-v2.md §11.2) so appends serialize across instances.
CREATE TABLE "app_sync_seq" (
    "cluster_id" VARCHAR(320) NOT NULL,
    "next_seq" BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT "app_sync_seq_pkey" PRIMARY KEY ("cluster_id")
);

-- Append-only change journal for the `@app` scope (dictation, xp, card_review).
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
    CONSTRAINT "app_sync_log_pkey" PRIMARY KEY ("cluster_id", "seq")
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
CREATE INDEX "app_sync_log_cluster_id_scope_seq_idx" ON "app_sync_log"("cluster_id", "scope", "seq");

-- CreateIndex
CREATE INDEX "app_applied_change_cluster_id_applied_at_idx" ON "app_applied_change"("cluster_id", "applied_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_dictation_cluster_id_media_uuid_subtitle_uuid_key" ON "app_dictation"("cluster_id", "media_uuid", "subtitle_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "app_xp_ledger_cluster_id_source_reference_id_dataset_uuid_key" ON "app_xp_ledger"("cluster_id", "source", "reference_id", "dataset_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "app_card_review_event_cluster_id_event_uuid_key" ON "app_card_review_event"("cluster_id", "event_uuid");

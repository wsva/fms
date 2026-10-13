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
--
-- Production runbook (never `db push` / `migrate deploy`):
--   psql -f <this file>
--   prisma migrate resolve --applied 20261013200000_add_read_attempt_events
--   deploy bundle

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

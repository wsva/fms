-- Phase 5: website as the Inbox host (sync-v2.md §6.3, §8.3, §14 step 5).
-- The website HOSTS proposals from editors without the journal (the website UI;
-- optionally an offline follower); the desktop authority drains them, applies via
-- its command path (INV-18, minting the real journal seq THERE), and acks
-- accepted[]/rejected[{winner_seq, winner_payload}] (INV-4). The website mints NO
-- journal seq (INV-1): proposal_seq is an inbox-ordering counter per
-- (cluster, scope), not a journal position. These routes write ONLY these two
-- tables — never app_sync_log, the dataset catalog, current_version, snapshot_seq,
-- or versions/ (INV-2, INV-17).
--
-- Production runbook (never `db push` / `migrate deploy`):
--   psql -f <this file>
--   prisma migrate resolve --applied 20261013180000_add_inbox_proposals
--   deploy bundle

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

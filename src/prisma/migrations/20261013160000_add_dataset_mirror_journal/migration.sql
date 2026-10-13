-- Phase 4: dataset-scope mirror journal (sync-v2.md §0, §8.2, §14 step 4).
-- The website already MINTS `@app`-scope seqs in app_sync_log (the cloud-authority
-- path, /api/v1/sync/changes). A mirror fill now STORES the hub's dataset-scope seqs
-- under the same cluster_id. Both number spaces start at 1, so the old
-- (cluster_id, seq) PK would collide — §3-fact-2 / §6.1's "two number spaces".
-- Widening the PK to (cluster_id, scope, seq) lets the minted @app space and the
-- mirrored dataset space coexist. Safe on live data: every existing row is
-- scope='@app' with seq already unique per cluster, so (cluster,'@app',seq) is
-- unique too. The dropped secondary index is subsumed by the new PK's leading cols.
--
-- Production runbook (never `db push` / `migrate deploy`):
--   psql -f <this file>
--   prisma migrate resolve --applied 20261013160000_add_dataset_mirror_journal
--   deploy the new bundle

ALTER TABLE "app_sync_log" DROP CONSTRAINT "app_sync_log_pkey";
DROP INDEX "app_sync_log_cluster_id_scope_seq_idx";
ALTER TABLE "app_sync_log" ADD CONSTRAINT "app_sync_log_pkey" PRIMARY KEY ("cluster_id", "scope", "seq");

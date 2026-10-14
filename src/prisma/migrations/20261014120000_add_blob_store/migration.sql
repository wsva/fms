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
-- Both tables are brand-new, so nothing existing breaks. GC (deleting a refcount-0
-- blob that no available='Y' version pins, INV-8) is an operator action, not a
-- trigger or default here.
--
-- Production runbook (never `db push` / `migrate deploy`):
--   psql -f <this file>
--   prisma migrate resolve --applied 20261014120000_add_blob_store
--   deploy the new bundle

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

-- AlterTable: subscription re-pointed from tags to dataset directories
ALTER TABLE "dataset_subscription" ALTER COLUMN "tag_uuid" DROP NOT NULL;
ALTER TABLE "dataset_subscription" ADD COLUMN     "dataset_uuid" VARCHAR(100);

-- DropIndex: legacy unique over (user_id, tag_uuid). Older deployments created it
-- as a table constraint, newer ones as a plain unique index, so drop both shapes.
ALTER TABLE "dataset_subscription" DROP CONSTRAINT IF EXISTS "dataset_subscription_user_id_tag_uuid_key";
DROP INDEX IF EXISTS "dataset_subscription_user_id_tag_uuid_key";

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

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

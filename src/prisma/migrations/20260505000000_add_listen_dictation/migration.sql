-- CreateTable
CREATE TABLE "listen_dictation" (
    "uuid" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(100) NOT NULL,
    "media_uuid" VARCHAR(100) NOT NULL,
    "subtitle_uuid" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "completed" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listen_dictation_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "listen_dictation_user_id_media_uuid_subtitle_uuid_key" ON "listen_dictation"("user_id", "media_uuid", "subtitle_uuid");

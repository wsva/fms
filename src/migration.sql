-- CreateTable
CREATE TABLE "settings_api_key" (
    "uuid" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_api_key_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "settings_api_key_key_hash_key" ON "settings_api_key"("key_hash");


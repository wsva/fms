CREATE TABLE "just_speaking" (
    "uuid"       VARCHAR(100) NOT NULL,
    "author"     VARCHAR(200) NOT NULL,
    "audio_path" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    CONSTRAINT "just_speaking_pkey" PRIMARY KEY ("uuid")
);

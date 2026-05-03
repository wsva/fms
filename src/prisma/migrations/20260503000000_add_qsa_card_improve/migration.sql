-- CreateTable
CREATE TABLE "qsa_card_improve" (
    "uuid" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "card_uuid" VARCHAR(100) NOT NULL,
    "current" TEXT NOT NULL,
    "improved" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qsa_card_improve_pkey" PRIMARY KEY ("uuid")
);

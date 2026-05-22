CREATE TABLE "ask_question_tag" (
    "uuid" VARCHAR(100) NOT NULL,
    "question_uuid" VARCHAR(100) NOT NULL,
    "tag_uuid" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ask_question_tag_pkey" PRIMARY KEY ("uuid")
);

INSERT INTO "dataset_scope" ("uuid") VALUES ('ask') ON CONFLICT DO NOTHING;

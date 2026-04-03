-- CreateTable
CREATE TABLE "oauth2_token" (
    "access_token" VARCHAR(1000) NOT NULL,
    "refresh_token" VARCHAR(1000) NOT NULL,
    "client_id" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(100) NOT NULL,
    "ip" VARCHAR(100) NOT NULL,
    "parent" VARCHAR(1000),

    CONSTRAINT "oauth2_token_pkey" PRIMARY KEY ("access_token")
);

-- CreateTable
CREATE TABLE "oauth2_user" (
    "user_id" VARCHAR(100) NOT NULL,
    "nickname" VARCHAR(100),
    "username" VARCHAR(100),
    "number" VARCHAR(100),
    "email" VARCHAR(100) NOT NULL,
    "password" VARCHAR(100) NOT NULL,
    "is_superuser" VARCHAR(1) NOT NULL,
    "is_staff" VARCHAR(1) NOT NULL,
    "is_active" VARCHAR(1) NOT NULL,

    CONSTRAINT "oauth2_user_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "plan_plan" (
    "uuid" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(100) NOT NULL,
    "content" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "favorite" VARCHAR(1),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_plan_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "plan_record" (
    "uuid" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(100) NOT NULL,
    "plan_uuid" VARCHAR(100) NOT NULL,
    "start_at" TIMESTAMPTZ(6),
    "status" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_record_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "dict_de" (
    "uuid" VARCHAR(255) NOT NULL,
    "url" VARCHAR(255) NOT NULL,

    CONSTRAINT "dict_de_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "dict_de_level" (
    "id" SERIAL NOT NULL,
    "lemma" VARCHAR(255) NOT NULL,
    "pos" VARCHAR(100) NOT NULL,
    "articles" VARCHAR(10) NOT NULL,
    "level" VARCHAR(10) NOT NULL,
    "url" VARCHAR(255) NOT NULL,

    CONSTRAINT "dict_de_level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dict_en" (
    "id" SERIAL NOT NULL,
    "headword" VARCHAR(255) NOT NULL,
    "pos" VARCHAR(100) NOT NULL,
    "level" VARCHAR(10) NOT NULL,
    "inventory" VARCHAR(255) NOT NULL,
    "notes" TEXT NOT NULL,

    CONSTRAINT "dict_en_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topword_de" (
    "id" INTEGER NOT NULL,
    "word" TEXT NOT NULL,
    "freq" INTEGER NOT NULL,
    "examples" INTEGER,
    "in_dict" VARCHAR(1),
    "base_form" TEXT,
    "article" VARCHAR(100),
    "level" VARCHAR(10),

    CONSTRAINT "topword_de_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topword_de_example" (
    "id" SERIAL NOT NULL,
    "word_id" INTEGER,
    "example" TEXT NOT NULL,

    CONSTRAINT "topword_de_example_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog" (
    "uuid" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "blog_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "listen_media" (
    "uuid" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(100) NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listen_media_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "listen_media_tag" (
    "uuid" VARCHAR(100) NOT NULL,
    "media_uuid" VARCHAR(100) NOT NULL,
    "tag_uuid" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listen_media_tag_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "listen_note" (
    "uuid" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(100) NOT NULL,
    "media_uuid" VARCHAR(100) NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listen_note_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "listen_subtitle" (
    "uuid" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(100) NOT NULL,
    "media_uuid" VARCHAR(100) NOT NULL,
    "language" VARCHAR(10) NOT NULL,
    "subtitle" TEXT NOT NULL,
    "format" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listen_subtitle_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "listen_tag" (
    "uuid" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(100) NOT NULL,
    "tag" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listen_tag_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "listen_transcript" (
    "uuid" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(100) NOT NULL,
    "media_uuid" VARCHAR(100) NOT NULL,
    "language" VARCHAR(10) NOT NULL,
    "transcript" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listen_transcript_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "listening_document" (
    "uuid" VARCHAR(100) NOT NULL,
    "access_path" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "listening_document_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "listening_storage" (
    "uuid" VARCHAR(100) NOT NULL,
    "upload_to" TEXT NOT NULL,
    "file" VARCHAR(100) NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "listening_storage_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "practice_text" (
    "uuid" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(100) NOT NULL,
    "text" TEXT NOT NULL,
    "created_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_text_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "practice_audio" (
    "uuid" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(100) NOT NULL,
    "text_uuid" VARCHAR(100) NOT NULL,
    "audio_path" TEXT,
    "recognized" TEXT,
    "created_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_audio_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "ask_question" (
    "uuid" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(100) NOT NULL,
    "title" TEXT,
    "audio_path" TEXT,
    "video_path" TEXT,
    "content" TEXT,
    "created_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ask_question_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "ask_answer" (
    "uuid" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(100) NOT NULL,
    "question_uuid" VARCHAR(100) NOT NULL,
    "audio_path" TEXT,
    "video_path" TEXT,
    "content" TEXT,
    "created_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ask_answer_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "book_meta" (
    "uuid" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(100) NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "language" VARCHAR(10) NOT NULL,
    "description" TEXT,
    "cover_path" TEXT,
    "source" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_meta_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "book_chapter" (
    "uuid" VARCHAR(100) NOT NULL,
    "book_uuid" VARCHAR(100) NOT NULL,
    "parent_uuid" VARCHAR(100),
    "order_num" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "created_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_chapter_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "book_sentence" (
    "uuid" VARCHAR(100) NOT NULL,
    "chapter_uuid" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(100) NOT NULL,
    "order_num" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "sentence_type" VARCHAR(20) NOT NULL,
    "audio_path" TEXT,
    "tts_path" TEXT,
    "recognized" TEXT,
    "created_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_sentence_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "qsa_card" (
    "uuid" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "question" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "familiarity" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "qsa_card_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "qsa_card_review" (
    "uuid" VARCHAR(100) NOT NULL,
    "interval_days" INTEGER NOT NULL,
    "ease_factor" INTEGER NOT NULL,
    "repetitions" INTEGER NOT NULL,
    "last_review_at" TIMESTAMPTZ(6) NOT NULL,
    "next_review_at" TIMESTAMPTZ(6) NOT NULL,
    "familiarity" INTEGER NOT NULL,
    "card_uuid" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,

    CONSTRAINT "qsa_card_review_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "qsa_card_tag" (
    "uuid" VARCHAR(100) NOT NULL,
    "card_uuid" VARCHAR(100) NOT NULL,
    "tag_uuid" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "qsa_card_tag_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "qsa_tag" (
    "uuid" VARCHAR(100) NOT NULL,
    "tag" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "abstract" VARCHAR(1),
    "children" TEXT,

    CONSTRAINT "qsa_tag_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "voice_access_action" (
    "uuid" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "action_type" VARCHAR(100) NOT NULL,
    "payload" TEXT,
    "created_by" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_access_action_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "voice_access_command" (
    "uuid" VARCHAR(100) NOT NULL,
    "action_uuid" VARCHAR(100) NOT NULL,
    "language" VARCHAR(10) NOT NULL,
    "text" TEXT NOT NULL,
    "created_by" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_access_command_pkey" PRIMARY KEY ("uuid")
);

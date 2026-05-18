-- AlterTable
ALTER TABLE "qsa_card" ADD COLUMN "question_hash" VARCHAR(100);

-- CreateIndex
CREATE INDEX "qsa_card_question_hash_idx" ON "qsa_card"("question_hash");

-- Backfill existing rows using pgcrypto (normalization mirrors normalizeQuestion() in card.ts)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
UPDATE "qsa_card"
SET question_hash = encode(
    digest(
        -- 4. strip article/reflexive prefix from two-token phrases
        regexp_replace(
            -- 3. strip trailing punctuation
            regexp_replace(
                -- 1+2. trim, lowercase, collapse whitespace
                regexp_replace(lower(trim(question)), '\s+', ' ', 'g'),
                '[?.!,;:]+$', ''
            ),
            '^(der|die|das|ein|eine|sich)\s+([^\s]+)$', '\2'
        ),
        'sha256'
    ),
    'hex'
)
WHERE question_hash IS NULL;

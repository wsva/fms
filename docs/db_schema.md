## Database schema

`````
CREATE TABLE topword_de (
    id          INTEGER PRIMARY KEY,
    word        TEXT NOT NULL,
    freq        INTEGER NOT NULL,
    examples    INTEGER,
    in_dict     VARCHAR(1),
    base_form   TEXT,
    article     VARCHAR(3)
);

CREATE TABLE topword_de_example (
    id SERIAL   PRIMARY KEY,   -- 自动递增 id
    word_id     INTEGER,
    example     TEXT NOT NULL
);

CREATE TABLE read_book (
    uuid        VARCHAR(100) PRIMARY KEY,
    name        TEXT NOT NULL,
    user_id     VARCHAR(100) NOT NULL,
    created_by  VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE read_chapter (
    uuid        VARCHAR(100) PRIMARY KEY,
    book_uuid   VARCHAR(100) NOT NULL,
    order_num   INT NOT NULL,
    name        TEXT NOT NULL,
    created_by  VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE read_sentence (
    uuid          VARCHAR(100) NOT NULL,
    chapter_uuid  VARCHAR(100) NOT NULL,
    order_num     INT NOT NULL,
    original      TEXT NOT NULL,
    recognized    TEXT,
    audio_path    TEXT,
    created_by    VARCHAR(100) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ask_question (
    uuid          VARCHAR(100) PRIMARY KEY,
    user_id       VARCHAR(100) NOT NULL,
    title         TEXT,
    audio_path    TEXT,
    video_path    TEXT,
    content       TEXT,
    created_by    VARCHAR(100) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ask_answer (
    uuid          VARCHAR(100) PRIMARY KEY,
    user_id       VARCHAR(100) NOT NULL,
    question_uuid VARCHAR(100) NOT NULL,
    audio_path    TEXT,
    video_path    TEXT,
    content       TEXT,
    created_by    VARCHAR(100) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE voice_access_action (
    uuid         VARCHAR(100) PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    action_type  VARCHAR(100) NOT NULL,
    payload      TEXT,
    created_by   VARCHAR(100),
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE voice_access_command (
    uuid         VARCHAR(100) PRIMARY KEY,
    action_uuid  VARCHAR(100) NOT NULL,
    language     VARCHAR(10) NOT NULL,
    text         TEXT NOT NULL,
    created_by   VARCHAR(100),
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE practice_text (
    uuid          VARCHAR(100) PRIMARY KEY,
    user_id       VARCHAR(100) NOT NULL,
    text          TEXT NOT NULL,
    created_by    VARCHAR(100) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE practice_audio (
    uuid          VARCHAR(100) PRIMARY KEY,
    user_id       VARCHAR(100) NOT NULL,
    text_uuid     VARCHAR(100) NOT NULL,
    audio_path    TEXT,
    recognized    TEXT,
    created_by    VARCHAR(100) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE plan_plan (
    uuid          VARCHAR(100) PRIMARY KEY,
    user_id       VARCHAR(100) NOT NULL,
    content       TEXT NOT NULL,
    minutes       INT NOT NULL,
    favorite      VARCHAR(1),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE plan_record (
    uuid          VARCHAR(100) PRIMARY KEY,
    user_id       VARCHAR(100) NOT NULL,
    plan_uuid     VARCHAR(100) NOT NULL,
    start_at      TIMESTAMPTZ,
    status        VARCHAR(100) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE listen_media (
    uuid          VARCHAR(100) PRIMARY KEY,
    user_id       VARCHAR(100) NOT NULL,
    title         TEXT NOT NULL,
    source        TEXT NOT NULL,
    note          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE listen_transcript (
    uuid          VARCHAR(100) PRIMARY KEY,
    user_id       VARCHAR(100) NOT NULL,
    media_uuid    VARCHAR(100) NOT NULL,
    language      VARCHAR(10) NOT NULL,
    transcript    TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE listen_subtitle (
    uuid          VARCHAR(100) PRIMARY KEY,
    user_id       VARCHAR(100) NOT NULL,
    media_uuid    VARCHAR(100) NOT NULL,
    language      VARCHAR(10) NOT NULL,
    subtitle      TEXT NOT NULL,
    format        VARCHAR(10) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE listen_note (
    uuid          VARCHAR(100) PRIMARY KEY,
    user_id       VARCHAR(100) NOT NULL,
    media_uuid    VARCHAR(100) NOT NULL,
    note          TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE listen_tag (
    uuid          VARCHAR(100) PRIMARY KEY,
    user_id       VARCHAR(100) NOT NULL,
    tag           TEXT NOT NULL,
    description   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE listen_media_tag (
    uuid          VARCHAR(100) PRIMARY KEY,
    media_uuid    VARCHAR(100) NOT NULL,
    tag_uuid      VARCHAR(100) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`````

CREATE TABLE book_meta (
    uuid        VARCHAR(100) PRIMARY KEY,
    user_id     VARCHAR(100) NOT NULL,       -- owner of the book
    title       TEXT NOT NULL,
    author      TEXT,                        -- optional author name
    language    VARCHAR(10) NOT NULL,        -- e.g. 'de', 'en', 'fr'
    description TEXT,
    cover_path  TEXT,                        -- path to cover image file
    source      TEXT,                        -- origin: URL, ISBN, etc.
    is_public   BOOLEAN NOT NULL DEFAULT FALSE,
    created_by  VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tree structure: parent_uuid NULL means root (top-level chapter).
-- Every node also stores book_uuid directly so all chapters of a book
-- can be fetched in a single query without recursive traversal.
--
-- Example hierarchy:
--   book_meta (uuid=B)
--   ├── book_chapter (parent_uuid=NULL,  book_uuid=B) ← Part I
--   │   ├── book_chapter (parent_uuid=Part I, book_uuid=B) ← Chapter 1
--   │   │   └── book_chapter (parent_uuid=Ch1, book_uuid=B) ← Section 1.1
--   │   └── book_chapter (parent_uuid=Part I, book_uuid=B) ← Chapter 2
--   └── book_chapter (parent_uuid=NULL,  book_uuid=B) ← Part II
CREATE TABLE book_chapter (
    uuid        VARCHAR(100) PRIMARY KEY,
    book_uuid   VARCHAR(100) NOT NULL,       -- always the top-level book
    parent_uuid VARCHAR(100),               -- NULL = root; references book_chapter(uuid)
    order_num   INT NOT NULL,               -- order among siblings (same parent)
    title       TEXT NOT NULL,
    description TEXT,
    created_by  VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- sentence_type values:
--   'text'            – a normal sentence or paragraph
--   'paragraph_break' – empty divider between paragraphs (replaces the "\n\n" hack)
CREATE TABLE book_sentence (
    uuid          VARCHAR(100) PRIMARY KEY,
    chapter_uuid  VARCHAR(100) NOT NULL,     -- leaf chapter this sentence belongs to
    user_id       VARCHAR(100) NOT NULL,     -- who recorded; allows multiple users on shared books
    order_num     INT NOT NULL,
    content       TEXT NOT NULL,             -- original text
    sentence_type VARCHAR(20) NOT NULL DEFAULT 'text',
    audio_path    TEXT,                      -- user's recorded audio (WAV)
    tts_path      TEXT,                      -- AI-generated TTS audio path
    recognized    TEXT,                      -- STT result for comparison
    created_by    VARCHAR(100) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

## Clean data

`````
UPDATE topword_de_example
SET example = regexp_replace(
    example,
    '\s+([,.!?])',
    '\1',
    'g'
)
WHERE example ~ '\s+[,.!?]';


`````

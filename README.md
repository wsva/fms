Fremdsprachen machen Spaß!

# create project
`````
docker pull node:22.19.0
docker run -it --user node --name next.js -v C:/Users/yanan/code/wsva/fms/next.js:/code node:22.19.0 /bin/bash
cd /code/
npx create-next-app@latest node_project


npm config set registry https://mirrors.cloud.tencent.com/npm/
npm config set registry https://registry.npmjs.org/


npx create-next-app@latest node_project
✔ Would you like to use TypeScript? … Yes
✔ Would you like to use ESLint? … Yes
✔ Would you like to use Tailwind CSS? … Yes
✔ Would you like to use `src/` directory? … Yes
✔ Would you like to use App Router? (recommended) … Yes
✔ Would you like to customize the default import alias (@/*)? … No
`````

# install
`````
cd node_project/
npm install @heroui/react framer-motion
npm install react-icons
npm install react-hook-form zod @hookform/resolvers
npm install next-auth@beta
npx auth secret
npm install uuid
npm install -D @types/uuid
npm install react-toastify
npm install marked

# error: sanitize is not a function
# npm install dompurify
# npm install -D @types/dompurify
npm install isomorphic-dompurify

npm install crypto-js
npm install -D @types/crypto-js
npm install wretch
npm install react-draggable

npm install @prisma/client@6.16.2 @auth/prisma-adapter
npm install prisma@6.16.2 --save-dev
# Generate Prisma Client
npm exec prisma generate
npm exec prisma@6.16.2 generate

npm install wav
npm i --save-dev @types/wav

npm install use-immer
npm install mime
`````

# db
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
    uuid          VARCHAR(100) PRIMARY KEY,
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
    minutes       INT NOT NULL,
    content       TEXT NOT NULL,
    status        VARCHAR(100) NOT NULL,
    created_by    VARCHAR(100) NOT NULL,
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

# clean data
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
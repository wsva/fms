# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FMS (Fremdsprachen machen Spaß — "Learning foreign languages is fun!") is a language learning platform built with Next.js 16 App Router. It features spaced repetition flashcards, listening/speaking practice with media streaming, dictation, word lookup, AI-assisted Q&A, study planning, and a blog.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production (Next.js standalone output)
npm run start    # Start production server
npm run lint     # Run ESLint
```

There is no test runner configured.

> **Note:** In Next.js 16, Middleware was renamed to **Proxy**. The file is `src/proxy.ts` and the exported function must be named `proxy`. `headers()` from `next/headers` works correctly inside it.

### Database (Prisma)

```bash
npx prisma generate          # Regenerate client after schema changes
npx prisma migrate dev       # Run migrations in development
npx prisma migrate deploy    # Apply migrations in production
```

The generated Prisma client lives at `src/generated/prisma/client` (not the default location). Schema and migrations are under `src/prisma/`.

## API Documentation

Full API reference: [`docs/api.md`](docs/api.md)

## Architecture

### Next.js App Router structure

- `src/app/` — pages and API routes using the App Router
- `src/app/actions/` — server actions (one file per feature domain)
- `src/lib/actions/` — lower-level server-side helpers called by server actions
- `src/components/` — shared React components
- `src/lib/` — singletons and utilities (`prisma.ts`, `auth.ts`, `auth-client.ts`, `utils.ts`, etc.)

### Data flow

Server actions in `src/app/actions/` are the primary interface between the client and the database. They call helpers in `src/lib/actions/` which call the Prisma client. API routes handle only auth (`/api/auth/[...all]`), file serving (`/api/data/[...filename]`), and subtitle access (`/api/listen/subtitle/[uuid]`).

### Authentication

Uses `better-auth` with a generic OAuth2/PKCE plugin pointing to a custom WSVA auth service. Config is in `src/lib/auth.ts` (server) and `src/lib/auth-client.ts` (client). The `api/auth/[...all]` route delegates entirely to `auth.handler`.

### Database

PostgreSQL via Prisma with the `@prisma/adapter-pg` adapter. The singleton client is in `src/lib/prisma.ts`. Key model groups:
- **Flashcards:** `qsa_card`, `qsa_tag`, `qsa_card_review` (spaced repetition)
- **Listening:** `listen_media`, `listen_transcript`, `listen_subtitle`, `listen_note`, `listen_tag`
- **Reading/Speaking:** `read_book`/`read_chapter`/`read_sentence`, `speak_text`/`speak_media`/`speak_review`
- **Words:** `word_user`, `word_phrase`, `word_example`, `topword_de`, `dict_de_level`, `dict_en`
- **Other:** `ask_question`/`ask_answer`, `plan_plan`/`plan_record`, `blog`, `voice_access_action`

All user-created models use UUID primary keys.

### AI Integration

`src/app/actions/ai_gemini.ts` calls the Google Gemini API (`@google/genai`) for text generation. `ai_local.ts` is an alternative local AI backend.

### Media / File Serving

`/api/data/[...filename]` serves files from a mounted volume, with HLS video streaming support (auto-detects and redirects to `.m3u8` manifests). `HlsPlayer.tsx` is the client-side HLS player using `hls.js`.

### UI

Uses HeroUI (`@heroui/react`) as the component library with Tailwind CSS v4. `src/components/Providers.tsx` wraps the app with `HeroUIProvider` and toast notifications. The color palette uses a "sand" theme.

## Key Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `BETTER_AUTH_URL` / `BETTER_AUTH_SECRET` | Auth service URL and JWT secret |
| `OAUTH2_*` | OAuth2 endpoints (authorize, token, userinfo, logout) |
| `REDIS_HOST` / `REDIS_PASSWORD` | Redis for caching |
| `GEMINI_API_KEY` | Google Gemini AI API |

## CI/CD

GitHub Actions (`.github/workflows/build.yml`) builds the Next.js standalone output, generates the Prisma client, and pushes artifacts to a separate `fms_build` repo. Deployed to Kubernetes (see `deployment.yaml`) in namespace `wsva`.

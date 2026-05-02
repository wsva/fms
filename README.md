# FMS — Fremdsprachen machen Spaß!

A language learning platform built with Next.js 16. Features include spaced-repetition flashcards, listening practice with HLS media streaming, speaking/reading practice, AI-assisted transcription (Google Gemini), word lookup, study planning, and a community blog.

---

## Architecture

- **Framework:** Next.js 16 (App Router, React 19, React Compiler)
- **UI:** HeroUI + Tailwind CSS v4
- **Auth:** better-auth with OAuth2/PKCE (custom WSVA provider), route protection via `src/proxy.ts`
- **Database:** PostgreSQL via Prisma 7 (`@prisma/adapter-pg`)
- **Cache:** Redis
- **AI:** Google Gemini API (`@google/genai`)
- **Media:** HLS.js for video streaming, files served from `/fms_data` volume

### Key directories

```
src/
├── app/actions/        # Server actions (one file per feature: card, listen, blog, …)
├── app/api/            # API routes (auth, file serving, subtitles)
├── lib/                # Singletons & utilities (prisma.ts, auth.ts, errors.ts, …)
├── components/         # Shared React components
├── generated/prisma/   # Auto-generated Prisma client (do not edit)
└── proxy.ts            # Route protection (Next.js 16 Proxy)
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Build for production (standalone output) |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint and auto-fix |
| `npm run type-check` | Run TypeScript type checking |
| `npm run format` | Format all files with Prettier |
| `npm run format:check` | Check formatting without writing |

---

## API Documentation

See [`docs/api.md`](docs/api.md) for the full API reference.

---

## Setup

Copy `.env.example` to `.env.local` and fill in all values, then:

```bash
npm install
npx prisma migrate deploy   # apply DB migrations
npx prisma generate         # generate Prisma client
npm run dev

npx prisma@7.6.0 migrate dev --name add_settings_tag
npx prisma@7.6.0 generate
```

---

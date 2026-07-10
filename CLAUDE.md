# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Runtime: Always Use Bun

This project uses Bun exclusively — never Node.js, npm, pnpm, or vite.

- `bun run index.ts` — run the server
- `bun --watch index.ts` — dev with hot reload (or `bun dev`)
- `bun install` — install dependencies
- `bun test` — run tests
- Bun auto-loads `.env` — do not use `dotenv`
- Use `Bun.serve()`, not Express; `bun:sqlite`, not better-sqlite3; `Bun.file`, not `fs.readFile`

## Commands

```bash
bun dev          # hot-reload dev server
bun start        # production run
```

There are no tests yet. To type-check: `bun --no-install index.ts --dry-run`

## Architecture

The entire service lives in a single file: `index.ts`. There are no subdirectories or modules.

**What it does:** An AI backend that receives surf condition data and returns a structured 2-paragraph surf report for St. Augustine, Florida. It is a companion service to a separate Vercel frontend.

**Request flow (cron path):**
1. Vercel cron calls `POST /cron/generate-fresh-report` with `{ cronSecret, vercelUrl }`
2. This service fetches live surf data from `vercelUrl/api/surfability`
3. Passes data to `generateDetailedSurfReport()` which calls OpenAI `gpt-4o-mini` via Vercel AI SDK (`generateObject`)
4. Structured response is validated against `surfReportSchema` (Zod)
5. Report is POSTed back to `vercelUrl/api/admin/save-report`

**Request flow (direct path):**
- `POST /generate-surf-report` with `{ surfData, apiKey }` — caller provides the surf data directly

**AI integration:** Uses `generateObject` from the `ai` package (Vercel AI SDK) with a Zod schema (`surfReportSchema`) to get structured output with typed fields: `conditionsAnalysis`, `recommendationsAndOutlook`, and a `recommendations` object. Falls back to `createEnhancedFallbackReport()` if OpenAI fails.

## API Endpoints

| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | None |
| POST | `/generate-surf-report` | `apiKey` field in body == `API_SECRET` |
| POST | `/cron/generate-fresh-report` | `cronSecret` field in body == `CRON_SECRET` |

## Environment Variables

```
OPENAI_API_KEY   # OpenAI API key
API_SECRET       # Shared secret for /generate-surf-report
CRON_SECRET      # Shared secret for /cron/generate-fresh-report (also used as Bearer token when saving to Vercel)
NODE_ENV         # development | production
PORT             # Default 3000 (prod/Docker); set to 8001 in local .env
```

## Deployment

Deployed via Docker on Coolify. The `Dockerfile` uses `oven/bun:1.1.29-alpine`, exposes port 3000, and health-checks `GET /health`. Lock file is `bun.lock` (not `bun.lockb`).

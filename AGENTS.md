# AGENTS.md

## Cursor Cloud specific instructions

### What this is
Norvar is a single Next.js 16 (App Router, Turbopack, React 19) application plus a set of
root-level Python 3 scripts used for one-off regulatory-corpus ingestion
(`norvar_ingest*.py`, `norvar_inference.py`). There is no Docker, no devcontainer, and no CI
config. Node deps use npm (`package-lock.json`); Python deps use `requirements.txt`.

### Running / building / linting / testing
Standard commands live in `package.json` `scripts`:
- Dev server: `npm run dev` (Next.js + Turbopack on `http://localhost:3000`).
- Lint: `npm run lint` (runs `eslint src audit`). Note: the repo currently has many
  pre-existing lint errors/warnings unrelated to environment setup — do not treat a non-zero
  exit here as an environment problem.
- Production build: `npm run build`. There is no automated test suite; the `audit:*` scripts
  (`audit/*.mjs`) are an internal end-to-end QA runner that hits a *running* app and require
  `AUDIT_SECRET` plus the same external API keys.

### Required environment variables (the big gotcha)
There is no committed `.env.example`. Secrets are read from `.env.local` / `.env` (gitignored).
The app cannot do anything useful without real credentials for these external SaaS services:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (Clerk auth)
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase Postgres + pgvector)
- `ANTHROPIC_API_KEY` (primary LLM)
- `VOYAGE_API_KEY` (RAG query embeddings)

Optional feature keys: `RESEND_API_KEY` (email/escalation), `ELEVENLABS_API_KEY` (voice),
`OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` (alternate model providers).

Non-obvious runtime behaviors discovered during setup:
- With an empty/missing Clerk publishable key the app still returns HTTP 200 but renders a
  **blank black screen** — Clerk's `<Show when="signed-in|signed-out">` gating in
  `src/app/page.tsx` shows nothing until Clerk initializes. Don't mistake the blank page for a
  crash; it means Clerk keys are missing/invalid.
- `npm run dev` starts fine without secrets (Supabase clients are created lazily per request),
  but `npm run build` FAILS at the "Collecting page data" step with `supabaseUrl is required`
  because several `src/app/api/*` route modules instantiate the Supabase client at import time.
  So for local development prefer `npm run dev`; a successful `npm run build` requires the
  Supabase env vars to be present.

### Supabase schema
The database schema is not migrated automatically. Apply the root `SETUP_*.sql` files (start
with `SETUP_SUPABASE.sql`, then `SETUP_SCHEMA_V3.sql`, then the remaining `SETUP_*.sql`) plus
`migrations/*.sql` against the Supabase project. The regulatory RAG corpus
(`regulatory_chunks`) is populated by the optional Python ingestion scripts
(`python norvar_ingest.py`).

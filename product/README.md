# Vestory — product (alpha)

The alpha version of Vestory: same UI as the `vestory/` POC, but the database is
real Postgres (Supabase) instead of local SQLite, and the podcast generator is
the newer `lib/podcast/*` pipeline instead of the POC's inline generator.

`vestory/` stays the running app until this is deliberately cut over — this
folder builds and is tested independently in the meantime.

## Setup

Requirements: Node.js 22.13+, a Supabase project, and an OpenAI API key.

1. Copy `.env.example` to `.env.local` and fill in:
   - `SUPABASE_URL` / `SUPABASE_SECRET_KEY` — Project Settings → API
   - `POSTGRES_URL_NON_POOLING` — Project Settings → Database → Connection string → URI (direct, port 5432) — only needed to run `db:schema`
   - `OPENAI_API_KEY`
2. `npm install`
3. `npm run db:schema` — applies every file in `supabase/migrations/` to your Supabase project (idempotent, safe to re-run).
4. `npm run dev` and open `http://127.0.0.1:5175/vestory_app`.

## What's different from `vestory/`

| | `vestory/` (POC) | `product/` (alpha) |
|---|---|---|
| Database | Local SQLite (`data/vestory.sqlite`) | Postgres via Supabase |
| Audio storage | Local disk (`data/audio/`) | Supabase Storage (`vestory-audio` bucket) |
| Generator | Inline OpenAI web-search pipeline (`lib/briefs.ts`) | `lib/podcast/*` — separate generate/verify/synthesize modules, reads source material from the `collected_items` table |
| UI | Same component, same design | Same component, same design |

## Known gap

`lib/podcast/dataSource.ts` reads from the `collected_items` table, which
nothing currently populates — there's no ingestion job yet. Until one exists,
generated episodes will have little or no real material to work from. This
is a data problem, not a wiring problem; the pipeline itself is verified
working end-to-end (see `vestory/app/api/debug-podcast-supabase-test/route.ts`
for a live diagnostic against the same schema).

## Schema

All tables live in `supabase/migrations/*.sql`, applied in filename order:
`settings`, `onboarding_draft`, `assets`, `interests`, `briefs`, `chapters`,
`sources`, `collected_items`, `podcast_cache` — plus the `vestory-audio`
storage bucket and two helper RPC functions (`replace_profile`,
`reset_brief_generation`) used for atomic multi-row writes.

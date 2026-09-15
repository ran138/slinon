# Vestory product

The complete Vestory application lives in this directory. It combines the
production UI and deployment flow with the modular, verified podcast pipeline,
Supabase Postgres, Supabase Storage, and OpenAI research, generation,
verification, embeddings, and speech synthesis.

## Setup

Requirements: Node.js 22.13+, a Supabase project, and an OpenAI API key.

1. Copy `.env.example` to `.env.local` and configure `OPENAI_API_KEY`,
   `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `POSTGRES_URL_NON_POOLING`.
2. Run `npm install`.
3. Run `npm run db:schema` to apply every migration in
   `supabase/migrations/`.
4. Run `npm run dev` and open `http://127.0.0.1:5175/vestory_app`.

## Runtime flow

1. The profile API stores holdings, watchlist entries, interests, and duration
   preferences in Supabase.
2. Brief creation refreshes cited portfolio knowledge from bounded sources and
   embeds it into `knowledge_documents`.
3. The modular podcast pipeline retrieves the relevant documents, generates a
   Hebrew script, verifies every chapter, and repairs unsupported sentences.
4. Speech synthesis runs per chapter, uploads MP3 files to the private
   `vestory-audio` bucket, and stores chapter timing and source links.
5. The player streams full or partial audio with HTTP range support.

If a live knowledge refresh temporarily fails, generation may use the last
successfully indexed snapshot. It fails safely when no verified documents are
available.

## Supabase keepalive

The `supabase-keepalive.yml` GitHub Actions workflow calls the protected
`/api/keepalive` route three times per day. The route performs one lightweight,
read-only query and returns no database rows. Configure the same randomly
generated `KEEPALIVE_SECRET` in both Vercel Production environment variables and
GitHub Actions repository secrets. This reduces the likelihood of Free Plan
inactivity pausing, but it is not a substitute for backups or a paid plan.

## Commands

- `npm run dev` — start Next.js on port 5175.
- `npm run build` — create the Cloudflare/Sites production build.
- `npm run build:next` — validate the native Next.js production build.
- `npm run typecheck` — validate TypeScript.
- `npm run lint` — validate source conventions.
- `npm run db:schema` — apply the Supabase schema.
- `npm run db:migrate` — import a legacy local SQLite dataset and audio.
- `npm run knowledge:refresh` — refresh portfolio knowledge manually.

## Data model

The migrations create profile, onboarding, brief, chapter, source, knowledge,
collection, and podcast-cache tables. Row Level Security blocks browser roles;
all privileged access uses the server-only Supabase secret. Never expose that
secret through a `NEXT_PUBLIC_` variable.

# Slinon

Slinon is building **Vestory**, a personalized Hebrew financial-news experience that turns a user's portfolio, watchlist, and interests into a short, sourced audio brief.

Vestory researches recent market reporting, selects the stories that matter to the user's profile, writes a structured Hebrew briefing, and synthesizes it into a chapter-based podcast. The product is designed to explain what happened and why it is relevant—not to provide investment advice.

## Live product

- [Slinon](https://www.slinon.me) — product landing page
- [Vestory app](https://www.slinon.me/vestory_app) — functional application
- [Marketing site](https://www.slinon.me/marketing) — extended product information and comparisons

## What Vestory does

- Accepts a free-text portfolio and asks the user to confirm the detected assets.
- Tracks holdings, watchlist assets, and broader topics of interest.
- Researches current reporting with OpenAI web search.
- Produces a sourced Hebrew brief tailored to the saved profile.
- Generates Hebrew speech for every chapter and a combined podcast.
- Explains why each story was selected and links back to its sources.
- Keeps an archive of completed briefs.

## Architecture

```text
Browser
  |
  v
Next.js application on Vercel
  |-- App Router UI (Hebrew, RTL)
  |-- Route Handlers under /api
  |
  |---> Supabase Postgres
  |       Profile, assets, interests, briefs, chapters, and sources
  |
  |---> Supabase Storage
  |       Generated MP3 files in the private vestory-audio bucket
  |
  `---> OpenAI APIs
          Web research, structured brief generation, and speech synthesis
```

The deployed application is a Next.js 16 modular monolith using React 19, TypeScript, Tailwind CSS, Supabase, and the OpenAI API. Vercel deploys the `product` directory from the `main` branch.

### Data model

- `settings` — language, target duration, and onboarding state
- `onboarding_draft` — temporary portfolio input and detected assets
- `assets` — portfolio holdings and watchlist items
- `interests` — predefined and custom topics
- `briefs` — generation state, profile snapshots, research, and completion metadata
- `chapters` — ordered scripts, personalization reasons, and audio references
- `sources` — citations associated with generated briefs

The canonical schema is defined in [`product/supabase/migrations/202609140001_initial.sql`](product/supabase/migrations/202609140001_initial.sql).

## Repository structure

```text
slinon/
├── product/                 # Deployed full-stack Next.js application
│   ├── app/                 # Pages and API route handlers
│   ├── components/          # Product UI and shared components
│   ├── db/                  # Server-only Supabase client
│   ├── lib/                 # Domain validation and brief generation
│   ├── public/              # Static Slinon and marketing pages used in production
│   ├── scripts/             # Schema setup and legacy-data migration tools
│   └── supabase/migrations/ # Postgres schema
├── marketing_page/          # Source for the static marketing experience
├── on_slinon_page/          # Source for the Slinon product landing page
├── ui_vestory_web_app/      # Standalone Vite UI prototype
└── README.md
```

`product` is the production application. The other directories preserve marketing sources and earlier interface work; they are not separate production services.

## Getting started

### Requirements

- Node.js 22.13 or newer
- npm
- A Supabase project
- An OpenAI API key with access to the configured text and speech models

### Install

```bash
git clone https://github.com/ran138/slinon.git
cd slinon/product
npm ci
cp .env.example .env.local
```

Add the required credentials to `product/.env.local`:

```dotenv
OPENAI_API_KEY=
OPENAI_TEXT_MODEL=gpt-5.6-terra
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=coral

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-server-only-secret-key
POSTGRES_URL_NON_POOLING=postgresql://postgres:password@host:5432/postgres
```

`SUPABASE_SECRET_KEY` and `POSTGRES_URL_NON_POOLING` are server-only credentials. Never expose them through a `NEXT_PUBLIC_` variable or commit them to Git.

### Initialize the database

Apply the checked-in schema to the configured Supabase project:

```bash
npm run db:schema
```

The migration creates the application tables, enables Row Level Security, grants access to the server-side service role, creates the required database functions, and prepares the private `vestory-audio` storage bucket.

### Run locally

```bash
npm run dev
```

Open [http://127.0.0.1:5175](http://127.0.0.1:5175). The functional product is available at [http://127.0.0.1:5175/vestory_app](http://127.0.0.1:5175/vestory_app).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server on port 5175 |
| `npm run build` | Create a production build |
| `npm start` | Run the production build locally |
| `npm run typecheck` | Validate the TypeScript project |
| `npm run lint` | Run ESLint |
| `npm run db:schema` | Apply the Supabase schema |
| `npm run db:migrate` | Import an existing local SQLite dataset and audio files into Supabase |

The SQLite migration is only needed when importing data from an older local installation. It reads `data/vestory.sqlite` and `data/audio/` by default; set `VESTORY_DATA_DIR` to read from a different directory.

## Application routes

### Pages

- `/` — Slinon product landing page
- `/marketing` — marketing site
- `/vestory_app` — Vestory application
- `/vestory_app/onboarding/*` — portfolio and interest onboarding
- `/vestory_app/today` — latest personalized brief
- `/vestory_app/portfolio` — portfolio editor
- `/vestory_app/preferences` — watchlist and interest settings
- `/vestory_app/archive` — completed brief archive

### API

```text
GET    /api/profile
PUT    /api/profile
GET    /api/onboarding/draft
PUT    /api/onboarding/draft
DELETE /api/onboarding/draft
POST   /api/portfolio/parse
GET    /api/briefs
POST   /api/briefs
GET    /api/briefs/:id
GET    /api/briefs/:id/audio/:chapter
```

## Brief generation flow

1. The user confirms a portfolio and selects at least one interest.
2. The server stores a versioned snapshot of the profile.
3. OpenAI web search gathers recent, cited reporting relevant to that snapshot.
4. A structured response turns the research into three to eight Hebrew chapters.
5. Each chapter is synthesized to MP3 and uploaded to Supabase Storage.
6. The completed brief, chapter metadata, and sources are saved in Supabase and displayed in the player.

Prompts and validation explicitly reject buy, sell, or hold instructions; price targets; unsupported figures; and invented portfolio information. OpenAI requests use `store: false`.

## Deployment

The repository is connected to the Vercel project `slinon` with the following production configuration:

```text
Git repository:    ran138/slinon
Production branch: main
Root directory:    product
Production domain: https://www.slinon.me
```

Pushes to `main` create production deployments. Other branches can create preview deployments. Supabase and OpenAI credentials must be configured in Vercel project settings for every required environment.

## Security status

This repository does not contain deployed secrets; `.env*` files are ignored except for the placeholder `.env.example`.

The current prototype uses one shared workspace and does **not** implement user authentication or per-user data isolation. Its API routes use a server-side Supabase secret and are reachable through the public deployment. Do not store sensitive or real financial information in the hosted application until authentication, authorization, and tenant-level Row Level Security policies are implemented.

## Contributing

1. Create a branch from `main`.
2. Keep secrets in `product/.env.local` only.
3. Run the validation checks before opening a pull request:

```bash
cd product
npm run lint
npm run typecheck
npm run build
```

4. Open a pull request and review its Vercel preview before merging.

## Financial disclaimer

Slinon and Vestory provide general educational information only. They do not provide personalized investment advice, recommendations to buy, sell, or hold an asset, price forecasts, or professional financial services.

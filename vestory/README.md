# Vestory

Local, single-user personalized investment podcast application. The interface, SQLite database, research archive and generated audio run on and remain on your computer. OpenAI is used for web research, structured Hebrew scripts and speech synthesis.

## Setup

Requirements: Node.js 22.13 or newer and an OpenAI API key with access to the configured text and speech models.

1. Copy `.env.example` to `.env.local`.
2. Add your key as `OPENAI_API_KEY`.
3. Install dependencies with `npm install`.
4. Start the application with `npm run dev`.
5. Open `http://127.0.0.1:5173`.

The default models are configurable in `.env.local`:

```dotenv
OPENAI_TEXT_MODEL=gpt-5.6-terra
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=coral
```

If a default model is unavailable to your OpenAI project, replace it with a compatible model available to that project.

## Local data

All durable local state is created under `data/`, which is ignored by source control:

- `data/vestory.sqlite` — profile, archive, scripts and source metadata
- `data/audio/` — generated chapter MP3 files

Back up that directory to preserve the profile and archive. The API key is never stored there.

On Vercel, the application automatically uses `/tmp/vestory` so server routes can run on the read-only serverless filesystem. That directory is ephemeral and should only be used for previews. Set `VESTORY_DATA_DIR` to a writable mounted volume for durable deployments, or replace the SQLite and file adapters with managed database and object storage services.

## Public routes

- `/` — Slinon product page, mirrored from `on_slinon_page`
- `/marketing` — marketing website, mirrored from `marketing_page`
- `/vestory_app` — the functional VESTORY application
- `/api` — application server routes

## Commands

- `npm run dev` — run locally on loopback port 5173
- `npm run build` — create a production build
- `npm start` — run the production build locally
- `npm run typecheck` — validate TypeScript
- `npm run lint` — run ESLint

The architecture and security boundaries are documented in `docs/architecture-vestory.md`.

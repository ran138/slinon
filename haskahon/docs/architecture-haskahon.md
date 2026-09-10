# חסכהון — System Architecture

## Purpose

חסכהון is a single-user, Hebrew RTL web application that runs on the user's computer. It turns a confirmed portfolio, optional watchlist, and selected interests into an on-demand, sourced Hebrew audio brief. Product data and generated MP3 files stay local; only the minimum profile context required for research and narration is sent to OpenAI.

## Architecture

- **Application:** Next.js 16 modular monolith using App Router and Node.js route handlers, bound to `127.0.0.1:5173`.
- **UI:** React, TypeScript, Tailwind CSS and the included shadcn primitives. All product UI is RTL; media progress remains LTR.
- **Database:** SQLite at `data/haskahon.sqlite`, accessed with Drizzle ORM and `better-sqlite3`. WAL, foreign keys and a busy timeout are enabled.
- **Audio:** Chapter MP3 files under `data/audio/<brief-id>/`; files are exposed only through database-owned IDs with HTTP byte-range support.
- **AI:** OpenAI Responses API for sourced web research and structured scripts, followed by the Speech API for Hebrew narration. API requests use `store: false`.
- **Secrets:** `OPENAI_API_KEY` is read only on the server from `.env.local`; it is never returned to the browser or stored in SQLite.

## Data Model

- `settings`: language, target brief length and onboarding completion.
- `assets`: holdings and watchlist entries. Quantity, average cost and currency are nullable strings and are never inferred.
- `interests`: predefined or custom topics.
- `briefs`: immutable versioned profile snapshot, state, progress, research dossier, title, duration and safe error metadata.
- `chapters`: ordered script, personalization reason, local audio filename, duration and global offset.
- `sources`: normalized citation metadata and safe HTTP(S) URLs.

## Generation Flow

1. The UI persists the confirmed canonical profile and requests a brief.
2. The server rejects incomplete profiles and reuses an existing active job instead of creating duplicates.
3. A profile snapshot is stored before generation.
4. OpenAI web search produces a sourced research dossier from recent reporting.
5. A second structured response creates Hebrew chapters using only that dossier and the exact snapshot entities.
6. Each bounded chapter is synthesized to MP3 and atomically saved locally.
7. The completed brief appears on Today and in the archive; older briefs are unchanged by later profile edits.

The prompt explicitly excludes buy/sell/hold guidance, forecasts, price targets, invented position data, and unsupported numbers. The UI also discloses that the voice is AI-generated and that the product is informational.

## HTTP Interfaces

- `GET/PUT /api/profile` loads or transactionally replaces the local profile.
- `POST /api/portfolio/parse` extracts only explicitly entered assets and requires confirmation.
- `GET/POST /api/briefs` lists completed briefs or starts generation.
- `GET /api/briefs/:id` returns status, chapters and sources.
- `GET /api/briefs/:id/audio/:chapter` streams a database-resolved MP3 with `200`, `206` and `416` behavior.

## Operational Decisions

- No authentication, cloud database, broker connection, scheduler, notifications, Redis or separate worker in v1.
- The server listens on loopback only and applies CSP, frame, MIME and referrer protections.
- Completed briefs are retained indefinitely; deletion is deferred.
- Market figures are omitted when a reliable cited value is unavailable.
- Models and TTS voice are configurable through environment variables.

# Vestory — System Architecture

## Purpose

Vestory is a single-user, Hebrew RTL web application. It turns a confirmed portfolio, optional watchlist, and selected interests into an on-demand, sourced Hebrew audio brief. Durable application data and generated audio are stored in Supabase; only the minimum profile and source context required for research, retrieval and narration is sent to OpenAI.

## Architecture

- **Application:** Next.js 16 modular monolith using App Router and Node.js route handlers, bound to `127.0.0.1:5173`.
- **UI:** React, TypeScript, Tailwind CSS and the included shadcn primitives. All product UI is RTL; media progress remains LTR.
- **Database:** Supabase Postgres for profile, briefs, citations and portfolio knowledge.
- **Vector retrieval:** Supabase pgvector stores 1,536-dimension `text-embedding-3-large` vectors. HNSW cosine search is filtered by portfolio symbols.
- **Audio:** Chapter and combined MP3 files are stored in the private `vestory-audio` Supabase Storage bucket and exposed only through database-owned IDs with HTTP byte-range support.
- **AI:** OpenAI web search is restricted to Calcalist, Ynet and SEC EDGAR for knowledge ingestion. The Embeddings API powers retrieval, the Responses API produces structured Hebrew scripts, and the Speech API produces narration. API requests use `store: false`.
- **Secrets:** `OPENAI_API_KEY` is read only on the server from the runtime environment; it is never returned to the browser or stored in the database.

## Data Model

- `settings`: language, target brief length and onboarding completion.
- `assets`: holdings and watchlist entries. Quantity, average cost and currency are nullable strings and are never inferred.
- `interests`: predefined or custom topics.
- `briefs`: immutable versioned profile snapshot, state, progress, research dossier, title, duration and safe error metadata.
- `chapters`: ordered script, personalization reason, private audio object path, duration and global offset.
- `sources`: normalized citation metadata and safe HTTP(S) URLs.
- `knowledge_documents`: short source-backed notes, portfolio symbols, metadata and vectors.
- `knowledge_ingestion_runs`: refresh status and per-source record counts.

## Generation Flow

1. The UI persists the confirmed canonical profile and requests a brief.
2. The server rejects incomplete profiles and reuses an existing active job instead of creating duplicates.
3. A profile snapshot is stored before generation.
4. The knowledge refresh searches only Calcalist, Ynet and SEC EDGAR, embeds source-backed notes and upserts them into pgvector.
5. Semantic search retrieves the records most relevant to the current portfolio and constructs a sourced dossier.
6. A structured response creates Hebrew chapters using only that dossier and the exact snapshot entities.
7. Each bounded chapter is synthesized to MP3 and saved to private object storage.
8. The completed brief appears on Today and in the archive; older briefs are unchanged by later profile edits.

The prompt explicitly excludes buy/sell/hold guidance, forecasts, price targets, invented position data, and unsupported numbers. The UI also discloses that the voice is AI-generated and that the product is informational.

## HTTP Interfaces

- `GET/PUT /api/profile` loads or transactionally replaces the profile.
- `POST /api/portfolio/parse` extracts only explicitly entered assets and requires confirmation.
- `GET/POST /api/briefs` lists completed briefs or starts generation.
- `GET /api/briefs/:id` returns status, chapters and sources.
- `GET /api/briefs/:id/audio/:chapter` streams a database-resolved MP3 with `200`, `206` and `416` behavior.

## Operational Decisions

- No end-user authentication, broker connection, scheduler, notifications, Redis or separate worker in v1.
- The server listens on loopback only and applies CSP, frame, MIME and referrer protections.
- Completed briefs are retained indefinitely; deletion is deferred.
- Market figures are omitted when a reliable cited value is unavailable.
- Models and TTS voice are configurable through environment variables.

# Commit-to-test coverage map

Tests target current observable behavior, not deleted implementation details.
Merge-only commits inherit the coverage of their parents. Reverts and deletion
commits are audited as history but do not receive assertions for behavior that
is intentionally absent from the current tree.

## Repository and static-site foundation

Covered by `ui-and-static-contracts.test.ts` and
`marketing-pages-quality.test.ts`:

- `1017c8c`, `0cfa7d4`, `4b971a3`, `dec7516`, `1d94f74`, `af94fc4`, `5fb02d5`,
  `42e3e6b`, `a7a845b`, `849e488`, `1bbb1a1`, `67273a6`, `b0c2299`, `c88361a`,
  `a41acfc`, `0f3dbcc`, `52801ab`
- Final marketing/company replacements: `1bb8708`, `1f8bcf4`, `e0caaff`,
  `783a1fe`, `2e1c285`
- Legal/static navigation: `634f182`, `9abeb7f`, `0a9b624`

## Product foundation, persistence and personalization

Covered by `domain-and-onboarding.test.ts`, `onboarding-exhaustive.test.ts`,
`domain-boundaries.test.ts`, `application-api.test.ts`,
`database-migrations.test.ts`, and the existing `product/tests` suite:

- `279a564`, `d6f80bf`, `38398ab`, `bf2d0c6`, `e0a4e0e`, `affde8d`
- Authentication and tenancy: `46109b4`, `c54f55d`
- Onboarding and matching: `bcce398`, `a010476`
- Schedule and settings: `7538e08`, `69c3f62`
- Tracking redesign: `5828acf`

## Playback, dashboard and product presentation

Covered by `schedule-and-podcast.test.ts`, `schedule-boundaries.test.ts`,
`operational-endpoints.test.ts`, and `ui-and-static-contracts.test.ts`:

- Playback start and continuity: `3c4ea68`, `6b45827`, `127c325`, `45e2cdb`,
  `046797e`
- Player metadata and controls: `ef81e22`, `2ff230a`, `928b286`, `abfa3e7`
- Branding/layout: `47d17ed`, `62ae089`, `69f94f8`, `986df79`, `3453f07`,
  `efa8988`
- Today dashboard and greeting: `2246a50`, `c59cf0f`, `ad12438`, `35dcc88`,
  `f5bf2b1`
- Live asset quotes: `7bc995d`

## Podcast generation, verification, notifications and scheduling

Covered by `schedule-and-podcast.test.ts`, `operational-endpoints.test.ts`,
`ui-and-static-contracts.test.ts`, and the existing ingestion tests:

- Generation data-source regression: `dc70481`
- Email delivery: `4208384`, `af3e6e2`
- Duration and resilient verification: `c574d37`
- Keepalive: `e3f8ec6`
- Scheduler precision and correlated holdings: `45efbda`, `c3dedcf`
- Ingestion/provider/chunking expansion: `3d13665`

## Analytics, privacy and authentication error handling

Covered by `auth-api.test.ts` and `ui-and-static-contracts.test.ts`:

- Product analytics/session replay: `9831b01`, `8845a86`
- OAuth diagnosis and safe presentation: `5f66023`, `6a27a5a`, `217c9cf`

## History-only commits

- Merge-only history: `42e686a`, `f01e1eb`, `6d241df`, `262a14b`, `a8a4515`,
  `002ee9f`, `410a80e`, `e726f78`, `f38c992`, `5c7b243`, `265c535`, `d763ea4`, `a10c84c`, `38e3afd`,
  `8573d05`, `b72b473`, `3bed3f2`, `454677a`, `dff4718`, `6c9b42e`, `a27692e`,
  `08dfb7b`, `836d9af`, `f54db81`, `c597068`, `068a03a`
- Documentation/cleanup: `cea4463`, `a2115f0`, `a5f7edb`, `bf0326d`, `94674ed`
- Explicit revert: `4203554`

The current `main` tip and its immediate predecessor (`3d13665`, `5f2d297`) are
represented by the ingestion/provider/knowledge tests included through
`tests/vitest.config.ts`.

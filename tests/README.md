# Slinon regression test suite

This directory is the repository-level test home requested for Slinon. It adds
coverage without changing application source, package manifests, migrations,
Git configuration, or existing tests.

## Scope

- Domain validation and onboarding parsing/matching
- Exhaustive aliases, fuzzy search, separators, deduplication, and free-text onboarding
- Daily and weekly scheduling, including Jerusalem time and DST
- Boundary matrices for profile fields, collections, weekdays, and delivery times
- Podcast schema, prompts, safety checks, display titles, cache identity, and audio paths
- Authentication, legal consent, password reset, OAuth, and safe error handling
- Protected profile, onboarding, brief, market-data, scheduler, keepalive, and audio APIs
- Finnhub symbol normalization, caching, crypto, TASE mappings, and failure behavior
- Today dashboard, player timeline, speed control, greetings, analytics masking, and responsive contracts
- Static marketing/company sites, legal links, accessibility, reduced motion, and source-orbit behavior
- Per-page document, directionality, viewport, skip-link, and legal-navigation contracts
- GitHub Actions, Vercel fallback cron, CSP, PostHog, transactional email, and local-only scripts
- Supabase schema, multitenancy, scheduling, notifications, ingestion providers, and vector chunks
- The preserved Vite UI prototype
- All existing ingestion/provider/knowledge tests under `product/tests`

## Run

From the repository root:

```bash
./product/node_modules/.bin/vitest run --config tests/vitest.config.ts
```

The shared configuration intentionally excludes live/integration tests. Those
remain available through the existing commands in `product/package.json` and
require the relevant local services or provider credentials.

## Latest run

- 521 tests collected
- 519 tests passed
- 2 assertions failed, representing 1 distinct application defect
- The OAuth redirect defect was fixed in the authentication callback

The remaining failures deliberately preserve evidence for a multi-word
custom-interest parsing regression. They should not be hidden by weakening the
assertions.

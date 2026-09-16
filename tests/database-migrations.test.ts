import { describe, expect, it } from "vitest";
import { readRepositoryFile } from "./helpers";

const migration = (name: string) => readRepositoryFile(`product/supabase/migrations/${name}`);

describe("initial Supabase schema", () => {
  const sql = migration("202609140001_initial.sql").toLowerCase();

  it.each(["settings", "onboarding_draft", "assets", "interests", "briefs", "chapters", "sources"])(
    "creates the %s table",
    (table) => expect(sql).toContain(`create table if not exists public.${table}`),
  );

  it("creates the private audio bucket and profile replacement transaction", () => {
    expect(sql).toContain("vestory-audio");
    expect(sql).toContain("create or replace function public.replace_profile");
    expect(sql).toContain("on conflict");
  });

  it("enables row-level security on every user-data table", () => {
    for (const table of ["settings", "onboarding_draft", "assets", "interests", "briefs", "chapters", "sources"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
  });
});

describe("schema evolution", () => {
  it("adds per-user ownership and cascades it through application data", () => {
    const sql = migration("202609151900_auth_multitenancy.sql").toLowerCase();
    expect(sql).toContain("user_id uuid");
    expect(sql).toContain("references auth.users");
    expect(sql).toContain("p_user_id uuid");
    expect(sql).toContain("on delete cascade");
  });

  it("records legal consent", () => {
    expect(migration("202609151901_terms_acceptance.sql").toLowerCase()).toContain("terms_accepted_at");
  });

  it("supports daily and weekday podcast schedules", () => {
    const daily = migration("202609151500_podcast_schedule.sql").toLowerCase();
    const weekly = migration("202609151700_weekday_podcast_schedule.sql").toLowerCase();
    expect(daily).toContain("podcast_plan");
    expect(daily).toContain("next_run_at");
    expect(weekly).toContain("schedule_day");
  });

  it("supports fifteen-minute episodes and deferred notifications", () => {
    expect(migration("202609152200_extend_target_minutes.sql")).toContain("15");
    const notifications = migration("202609160001_scheduled_notify_time.sql").toLowerCase();
    expect(notifications).toContain("notify_at");
    expect(notifications).toContain("notified_at");
  });

  it("creates cache identity for generated podcasts", () => {
    const sql = migration("202609141800_podcast_cache.sql").toLowerCase();
    expect(sql).toContain("podcast_cache");
    expect(sql).toContain("hash");
    expect(sql).toContain("brief_id");
  });
});

describe("knowledge ingestion schema", () => {
  it("tracks documents, collected items, ingestion runs and vector search", () => {
    const portfolio = migration("202609140002_portfolio_knowledge.sql").toLowerCase();
    const collected = migration("202609141700_collected_items.sql").toLowerCase();
    expect(portfolio).toContain("knowledge_documents");
    expect(portfolio).toContain("knowledge_ingestion_runs");
    expect(portfolio).toContain("vector(1536)");
    expect(collected).toContain("collected_items");
  });

  it("models provider quotas, fallback state and failed items", () => {
    const sql = migration("202609160900_ingestion_providers.sql").toLowerCase();
    for (const table of [
      "ingestion_provider_config", "ingestion_provider_usage", "ingestion_provider_state",
      "ingestion_extraction_attempts", "ingestion_failed_items",
    ]) expect(sql).toContain(`create table public.${table}`);
    expect(sql).toContain("reserve_ingestion_provider_credits");
    expect(sql).toContain("record_ingestion_provider_failure");
  });

  it("uses versioned token-aware chunks with atomic processing ownership", () => {
    const sql = migration("202609161000_knowledge_chunks.sql").toLowerCase();
    expect(sql).toContain("create table if not exists public.knowledge_chunks");
    expect(sql).toContain("chunk_index integer");
    expect(sql).toContain("processing_token");
    expect(sql).toContain("prepare_knowledge_document");
    expect(sql).toContain("commit_knowledge_chunks");
    expect(sql).toContain("fail_knowledge_processing");
    expect(sql).toContain("match_knowledge_chunks");
    expect(sql).toContain("using hnsw");
  });

  it("keeps privileged ingestion data inaccessible to browser roles", () => {
    const sql = [
      migration("202609160900_ingestion_providers.sql"),
      migration("202609161000_knowledge_chunks.sql"),
    ].join("\n").toLowerCase();
    expect(sql).toContain("revoke all");
    expect(sql).toContain("from anon, authenticated");
    expect(sql).toContain("to service_role");
  });
});

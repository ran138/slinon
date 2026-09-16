import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscoveryConnector, ArticleCandidate } from "./discovery/types";
import { discoverAllSources } from "./discovery/connectors";
import { articleToKnowledgeInput, processKnowledgeDocument, type EmbeddingProvider, type KnowledgeStore } from "./knowledge-pipeline";
import type { FallbackExtractor } from "./providers/fallback";
import { rankNewsCandidates } from "./ranking";
import type { SecEdgarClient, TrackedCompany } from "./sec-edgar";

export type IngestionRunType = "daily" | "backfill";

export interface IngestionProfile {
  companies: TrackedCompany[];
  symbols: string[];
  topics: string[];
}

export interface IngestionRunDependencies {
  supabase: SupabaseClient;
  connectors: readonly DiscoveryConnector[];
  extractor: FallbackExtractor;
  knowledgeStore: KnowledgeStore;
  embeddings: EmbeddingProvider;
  secClient?: SecEdgarClient;
  now?: Date;
}

export interface IngestionRunResult {
  runId: string;
  newsCandidateCount: number;
  newsSavedCount: number;
  filingSavedCount: number;
  sourceFailures: number;
  itemFailures: number;
}

export function isSecEligibleAsset(asset: { symbol: string; asset_class?: string | null; exchange?: string | null }): boolean {
  const classification = `${asset.asset_class ?? ""} ${asset.exchange ?? ""}`.toLocaleLowerCase();
  return !/(crypto|currency|forex|commodity|cash|bond|מטבע|קריפטו)/i.test(classification)
    && /^[A-Z][A-Z0-9.-]{0,9}$/.test(asset.symbol.trim().toUpperCase());
}

function matches(value: string, terms: readonly string[]): string[] {
  const normalized = value.toLocaleLowerCase();
  return terms.filter((term) => normalized.includes(term.toLocaleLowerCase()));
}

async function alreadyStored(supabase: SupabaseClient, sourceSite: string, sourceId: string): Promise<boolean> {
  const result = await supabase.from("knowledge_documents")
    .select("id")
    .eq("source_site", sourceSite)
    .eq("source_id", sourceId)
    .limit(1)
    .maybeSingle();
  if (result.error) throw new Error(`check existing knowledge document: ${result.error.message}`);
  return Boolean(result.data);
}

async function recordAttempts(
  supabase: SupabaseClient,
  runId: string,
  sourceUrl: string,
  attempts: Awaited<ReturnType<FallbackExtractor["extract"]>>["attempts"],
): Promise<void> {
  if (!attempts.length) return;
  const completedAt = new Date().toISOString();
  const result = await supabase.from("ingestion_extraction_attempts").insert(attempts.map((attempt) => ({
    run_id: runId,
    source_url: sourceUrl,
    provider: attempt.provider,
    attempt_number: Math.max(1, attempt.attempt),
    status: attempt.status,
    failure_code: attempt.failureCode ?? null,
    credits_reserved: attempt.creditsReserved ?? (attempt.status === "skipped" ? 0 : 1),
    metadata: attempt.message ? { message: attempt.message } : {},
    completed_at: completedAt,
  })));
  if (result.error) throw new Error(`record extraction attempts: ${result.error.message}`);
}

async function recordFailedItem(
  supabase: SupabaseClient,
  runId: string,
  candidate: ArticleCandidate,
  failureCode: string,
): Promise<void> {
  const result = await supabase.from("ingestion_failed_items").upsert({
    run_id: runId,
    source_site: candidate.source,
    source_id: candidate.sourceId,
    source_url: candidate.url,
    title: candidate.title,
    failure_code: failureCode,
    last_failed_at: new Date().toISOString(),
  }, { onConflict: "source_site,source_id" });
  if (result.error) throw new Error(`record failed ingestion item: ${result.error.message}`);
}

async function clearFailedItem(supabase: SupabaseClient, sourceSite: string, sourceId: string): Promise<boolean> {
  const result = await supabase.from("ingestion_failed_items").delete()
    .eq("source_site", sourceSite).eq("source_id", sourceId);
  return !result.error;
}

function candidateContext(candidate: ArticleCandidate, profile: IngestionProfile) {
  const text = `${candidate.title} ${candidate.summary ?? ""}`;
  return {
    symbols: matches(text, profile.symbols),
    topics: matches(text, profile.topics),
  };
}

export async function runIngestion(
  runType: IngestionRunType,
  profile: IngestionProfile,
  dependencies: IngestionRunDependencies,
): Promise<IngestionRunResult> {
  const now = dependencies.now ?? new Date();
  const started = await dependencies.supabase.from("knowledge_ingestion_runs").insert({
    status: "running",
    run_type: runType,
    portfolio_symbols: profile.symbols,
    metadata: { startedBy: "local_manual" },
  }).select("id").single();
  if (started.error) throw new Error(`start ingestion run: ${started.error.message}`);
  const runId = started.data.id as string;
  let newsSavedCount = 0;
  let filingSavedCount = 0;
  let itemFailures = 0;
  let newsCandidateCount = 0;
  let sourceFailures = 0;
  const sourceCounts: Record<string, number> = {};

  try {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
    const discovered = await discoverAllSources(dependencies.connectors, { since: sevenDaysAgo, now, limit: 500 });
    sourceFailures = discovered.failures.length;
    for (const candidate of discovered.candidates) {
      sourceCounts[candidate.source] = (sourceCounts[candidate.source] ?? 0) + 1;
    }
    const selected = rankNewsCandidates(discovered.candidates, {
      now,
      maxItems: 50,
      preferences: { symbols: profile.symbols, topics: profile.topics },
    });
    newsCandidateCount = selected.length;

    for (const candidate of selected) {
      try {
        if (await alreadyStored(dependencies.supabase, candidate.source, candidate.sourceId)) {
          if (!await clearFailedItem(dependencies.supabase, candidate.source, candidate.sourceId)) sourceFailures += 1;
          continue;
        }
        const outcome = await dependencies.extractor.extract({
          url: candidate.url,
          sourceSite: candidate.source,
          sourceId: candidate.sourceId,
        });
        await recordAttempts(dependencies.supabase, runId, candidate.url, outcome.attempts);
        if (!outcome.ok) {
          await recordFailedItem(dependencies.supabase, runId, candidate, outcome.failureCode);
          itemFailures += 1;
          continue;
        }
        const context = candidateContext(candidate, profile);
        await processKnowledgeDocument(articleToKnowledgeInput(outcome.article, {
          sourceSite: candidate.source,
          sourceId: candidate.sourceId,
          symbols: context.symbols,
          topics: context.topics,
        }), { store: dependencies.knowledgeStore, embeddings: dependencies.embeddings });
        newsSavedCount += 1;
        if (!await clearFailedItem(dependencies.supabase, candidate.source, candidate.sourceId)) sourceFailures += 1;
      } catch (error) {
        await recordFailedItem(
          dependencies.supabase,
          runId,
          candidate,
          error instanceof Error ? "processing_error" : "unknown_error",
        ).catch(() => undefined);
        itemFailures += 1;
      }
    }

    if (dependencies.secClient && profile.companies.length) {
      const since = new Date(now.getTime() - (runType === "backfill" ? 365 : 7) * 86_400_000);
      let filings = [] as Awaited<ReturnType<SecEdgarClient["listFilings"]>>;
      try {
        filings = await dependencies.secClient.listFilings({
          companies: profile.companies,
          since,
          now,
          includeHistory: runType === "backfill",
          limit: 50,
        });
      } catch {
        sourceFailures += 1;
      }
      for (const filing of filings.slice(0, 50)) {
        try {
          if (await alreadyStored(dependencies.supabase, "sec_edgar", filing.sourceId)) continue;
          const document = await dependencies.secClient.fetchFiling(filing);
          await processKnowledgeDocument(document, {
            store: dependencies.knowledgeStore,
            embeddings: dependencies.embeddings,
          });
          filingSavedCount += 1;
        } catch {
          itemFailures += 1;
        }
      }
    }

    const completed = await dependencies.supabase.from("knowledge_ingestion_runs").update({
      status: "completed",
      source_counts: sourceCounts,
      news_candidate_count: newsCandidateCount,
      news_saved_count: newsSavedCount,
      filing_saved_count: filingSavedCount,
      metadata: { sourceFailures, itemFailures },
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    if (completed.error) throw new Error(`complete ingestion run: ${completed.error.message}`);
    return { runId, newsCandidateCount, newsSavedCount, filingSavedCount, sourceFailures, itemFailures };
  } catch (error) {
    await dependencies.supabase.from("knowledge_ingestion_runs").update({
      status: "failed",
      error_message: (error instanceof Error ? error.message : "ingestion_failed").slice(0, 500),
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    throw error;
  }
}

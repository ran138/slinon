import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { assertLocalServiceEnvironment } from "./lib/local-only.mjs";
import { createDiscoveryConnectors } from "../lib/ingestion/discovery/connectors";
import { OpenAIEmbeddingProvider, SupabaseKnowledgeStore } from "../lib/ingestion/knowledge-pipeline";
import { createConfiguredArticleExtractor } from "../lib/ingestion/providers/factory";
import { isSecEligibleAsset, runIngestion, type IngestionProfile, type IngestionRunType } from "../lib/ingestion/run";
import { SecEdgarClient } from "../lib/ingestion/sec-edgar";

assertLocalServiceEnvironment(process.env);
const runType = process.argv[2] as IngestionRunType;
if (runType !== "daily" && runType !== "backfill") throw new Error("Expected daily or backfill");
const supabaseUrl = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiKey = process.env.OPENAI_API_KEY?.trim();
if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
if (!openaiKey) throw new Error("OPENAI_API_KEY is required");

const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const [assets, interests] = await Promise.all([
  supabase.from("assets").select("kind,name,symbol,asset_class,exchange"),
  supabase.from("interests").select("label"),
]);
if (assets.error) throw new Error(`load tracked assets: ${assets.error.message}`);
if (interests.error) throw new Error(`load interests: ${interests.error.message}`);
const profile: IngestionProfile = {
  companies: (assets.data ?? []).filter(isSecEligibleAsset).map((asset) => ({
    symbol: asset.symbol,
    name: asset.name,
    portfolio: asset.kind === "holding",
  })),
  symbols: [...new Set((assets.data ?? []).map((asset) => asset.symbol.trim().toUpperCase()).filter(Boolean))],
  topics: [...new Set((interests.data ?? []).map((interest) => interest.label.trim()).filter(Boolean))],
};
const configured = await createConfiguredArticleExtractor(supabase);
const openai = new OpenAI({ apiKey: openaiKey, timeout: 120_000, maxRetries: 2 });
const secUserAgent = process.env.SEC_USER_AGENT?.trim();
if (profile.companies.length && !secUserAgent) {
  throw new Error("SEC_USER_AGENT is required when tracked SEC-eligible companies exist");
}
const result = await runIngestion(runType, profile, {
  supabase,
  connectors: createDiscoveryConnectors(),
  extractor: configured.extractor,
  knowledgeStore: new SupabaseKnowledgeStore(supabase),
  embeddings: new OpenAIEmbeddingProvider(openai),
  secClient: secUserAgent ? new SecEdgarClient({ userAgent: secUserAgent }) : undefined,
});
console.log(JSON.stringify(result, null, 2));

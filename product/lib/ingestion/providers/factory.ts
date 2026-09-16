import type { SupabaseClient } from "@supabase/supabase-js";
import { DecodoArticleProvider, type DecodoProviderOptions } from "./decodo";
import { FallbackExtractor, type FallbackExtractorOptions } from "./fallback";
import { FirecrawlArticleProvider, type FirecrawlProviderOptions } from "./firecrawl";
import { SupabaseProviderQuotaStore } from "./quota";
import { ScraperApiArticleProvider, type ScraperApiProviderOptions } from "./scraperapi";
import type { ArticleProvider, ProviderName } from "./types";

interface ProviderConfigRow {
  provider: ProviderName;
  priority: number;
  enabled: boolean;
}

export interface ConfiguredExtractorOptions {
  environment?: Record<string, string | undefined>;
  decodo?: Pick<DecodoProviderOptions, "fetcher" | "requestTimeoutMs" | "now">;
  firecrawl?: Pick<FirecrawlProviderOptions, "fetcher" | "requestTimeoutMs" | "now">;
  scraperapi?: Pick<ScraperApiProviderOptions, "fetcher" | "requestTimeoutMs" | "now">;
  fallback?: Omit<FallbackExtractorOptions, "quotaStore">;
}

export interface ConfiguredExtractor {
  extractor: FallbackExtractor;
  providerNames: ProviderName[];
}

function required(environment: Record<string, string | undefined>, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required for an enabled ingestion provider`);
  return value;
}

export async function createConfiguredArticleExtractor(
  supabase: SupabaseClient,
  options: ConfiguredExtractorOptions = {},
): Promise<ConfiguredExtractor> {
  const environment = options.environment ?? process.env;
  const { data, error } = await supabase
    .from("ingestion_provider_config")
    .select("provider,priority,enabled")
    .eq("enabled", true)
    .order("priority", { ascending: true });
  if (error) throw new Error(`load ingestion provider config: ${error.message}`);

  const providers: ArticleProvider[] = [];
  for (const config of (data ?? []) as ProviderConfigRow[]) {
    if (config.provider === "decodo") {
      providers.push(new DecodoArticleProvider({
        apiToken: required(environment, "DECODO_API_KEY"),
        ...options.decodo,
      }));
    } else if (config.provider === "firecrawl") {
      providers.push(new FirecrawlArticleProvider({
        apiKey: required(environment, "FIRECRAWL_API_KEY"),
        ...options.firecrawl,
      }));
    } else if (config.provider === "scraperapi") {
      providers.push(new ScraperApiArticleProvider({
        apiKey: required(environment, "SCRAPERAPI_API_KEY"),
        ...options.scraperapi,
      }));
    }
  }
  if (!providers.length) throw new Error("No implemented ingestion providers are enabled and configured");

  return {
    extractor: new FallbackExtractor(providers, {
      ...options.fallback,
      quotaStore: new SupabaseProviderQuotaStore(supabase),
    }),
    providerNames: providers.map((provider) => provider.name),
  };
}

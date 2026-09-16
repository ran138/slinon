export type NewsSource =
  | "calcalist"
  | "ynet"
  | "globes"
  | "themarker"
  | "reuters"
  | "cnbc"
  | "yahoo_finance";

export interface DiscoveryRequest {
  since: Date;
  now?: Date;
  limit?: number;
}

export interface ArticleCandidate {
  source: NewsSource;
  sourceId: string;
  url: string;
  canonicalUrl: string;
  title: string;
  summary: string | null;
  publishedAt: string | null;
  language: string | null;
  metadata: Record<string, unknown>;
}

export interface DiscoveryConnector {
  readonly source: NewsSource;
  discover(request: DiscoveryRequest): Promise<ArticleCandidate[]>;
}

export class DiscoverySourceError extends Error {
  readonly source: NewsSource;
  readonly causes: unknown[];

  constructor(source: NewsSource, message: string, causes: unknown[] = []) {
    super(message);
    this.name = "DiscoverySourceError";
    this.source = source;
    this.causes = causes;
  }
}

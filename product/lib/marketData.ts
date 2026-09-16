import "server-only";

export interface MarketQuote {
  price: number;
  currency: string | null;
  changePercent: number;
  logoUrl: string | null;
}

const CRYPTO_SYMBOLS: Record<string, string> = {
  BTC: "BINANCE:BTCUSDT",
  ETH: "BINANCE:ETHUSDT",
  SOL: "BINANCE:SOLUSDT",
};

// Free-tier Finnhub has no direct Tel Aviv Stock Exchange coverage, but
// several TASE-listed catalog entries are also dual-listed on a US
// exchange under a different symbol — use that instead of the TASE
// symbol/suffix where one exists (verified against the live API).
// TASE:FIBI (a domestic-only Israeli bank) has no US listing and isn't
// mapped — it correctly falls back to no data, same as today.
const TASE_US_LISTINGS: Record<string, string> = {
  "TASE:NICE": "NICE",
  "TASE:TEVA": "TEVA",
  "TASE:CHKP": "CHKP",
  "TASE:WIXL": "WIX",
  "TASE:MNDY": "MNDY",
};

function resolveFinnhubSymbol(ticker: string): string | null {
  const upper = ticker.trim().toUpperCase();
  if (!upper) return null;
  if (upper.startsWith("TASE:")) return TASE_US_LISTINGS[upper] ?? null;
  return CRYPTO_SYMBOLS[upper] ?? upper;
}

// Cached on globalThis (not a plain module-level Map) so it survives Next
// dev-mode module reloads, matching the pattern already used for the
// in-flight generation job registry in lib/briefs.ts.
const cache = (globalThis as typeof globalThis & { __marketDataCache?: Map<string, { data: MarketQuote | null; expires: number }> })
  .__marketDataCache ?? new Map<string, { data: MarketQuote | null; expires: number }>();
(globalThis as typeof globalThis & { __marketDataCache?: typeof cache }).__marketDataCache = cache;

const CACHE_TTL_MS = 60_000;

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Real-time-ish (Finnhub's free tier is ~15min delayed) price + % change,
 *  plus a company logo URL when available. Returns null when unconfigured
 *  (no FINNHUB_API_KEY — safe no-op, same pattern as the Resend/PostHog
 *  integrations), unsupported (TASE tickers), or the upstream call fails —
 *  callers should treat null as "no data available", not an error. */
export async function getMarketQuote(ticker: string): Promise<MarketQuote | null> {
  const apiKey = process.env.FINNHUB_API_KEY?.trim();
  if (!apiKey) return null;

  const symbol = resolveFinnhubSymbol(ticker);
  if (!symbol) return null;

  const cached = cache.get(symbol);
  if (cached && cached.expires > Date.now()) return cached.data;

  const isCrypto = symbol.includes(":");
  const [quote, profile] = await Promise.all([
    fetchJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`),
    isCrypto ? Promise.resolve(null) : fetchJson(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`),
  ]);

  const price = typeof quote?.c === "number" && quote.c > 0 ? quote.c : null;
  const changePercent = typeof quote?.dp === "number" ? quote.dp : null;
  const data: MarketQuote | null = price !== null && changePercent !== null
    ? {
      price,
      changePercent,
      logoUrl: typeof profile?.logo === "string" && profile.logo ? profile.logo : null,
      currency: typeof profile?.currency === "string" ? profile.currency : isCrypto ? "USD" : null,
    }
    : null;

  cache.set(symbol, { data, expires: Date.now() + CACHE_TTL_MS });
  return data;
}

export async function getMarketQuotes(tickers: string[]): Promise<Record<string, MarketQuote | null>> {
  const unique = Array.from(new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)));
  const entries = await Promise.all(unique.map(async (ticker) => [ticker, await getMarketQuote(ticker)] as const));
  return Object.fromEntries(entries);
}

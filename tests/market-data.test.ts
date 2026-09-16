import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type GlobalWithMarketCache = typeof globalThis & { __marketDataCache?: Map<string, unknown> };

async function loadMarketData() {
  vi.resetModules();
  return await import("../product/lib/marketData");
}

beforeEach(() => {
  delete (globalThis as GlobalWithMarketCache).__marketDataCache;
  delete process.env.FINNHUB_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FINNHUB_API_KEY;
  delete (globalThis as GlobalWithMarketCache).__marketDataCache;
});

describe("market data", () => {
  it("is a safe no-op when Finnhub is not configured", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { getMarketQuote } = await loadMarketData();
    await expect(getMarketQuote("AAPL")).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("normalizes a stock quote and company logo", async () => {
    process.env.FINNHUB_API_KEY = "test-key";
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ c: 234.5, dp: 1.25 }))
      .mockResolvedValueOnce(Response.json({ currency: "USD", logo: "https://logo.example/apple.png" }));
    vi.stubGlobal("fetch", fetcher);
    const { getMarketQuote } = await loadMarketData();

    await expect(getMarketQuote(" aapl ")).resolves.toEqual({
      price: 234.5,
      changePercent: 1.25,
      currency: "USD",
      logoUrl: "https://logo.example/apple.png",
    });
    expect(String(fetcher.mock.calls[0][0])).toContain("symbol=AAPL");
    expect(String(fetcher.mock.calls[0][0])).toContain("token=test-key");
  });

  it("maps supported Tel Aviv listings to their US symbols", async () => {
    process.env.FINNHUB_API_KEY = "test-key";
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ c: 10, dp: -2 }))
      .mockResolvedValueOnce(Response.json({ currency: "USD" }));
    vi.stubGlobal("fetch", fetcher);
    const { getMarketQuote } = await loadMarketData();

    await getMarketQuote("TASE:TEVA");
    expect(String(fetcher.mock.calls[0][0])).toContain("symbol=TEVA");
  });

  it("does not call Finnhub for an unsupported domestic-only TASE listing", async () => {
    process.env.FINNHUB_API_KEY = "test-key";
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { getMarketQuote } = await loadMarketData();

    await expect(getMarketQuote("TASE:FIBI")).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses the Binance pair and avoids a company-profile request for crypto", async () => {
    process.env.FINNHUB_API_KEY = "test-key";
    const fetcher = vi.fn().mockResolvedValue(Response.json({ c: 63_000, dp: 2.4 }));
    vi.stubGlobal("fetch", fetcher);
    const { getMarketQuote } = await loadMarketData();

    await expect(getMarketQuote("btc")).resolves.toEqual({
      price: 63_000, changePercent: 2.4, currency: "USD", logoUrl: null,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain("symbol=BINANCE%3ABTCUSDT");
  });

  it("returns null for upstream failures and incomplete quotes", async () => {
    process.env.FINNHUB_API_KEY = "test-key";
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetcher);
    const { getMarketQuote } = await loadMarketData();
    await expect(getMarketQuote("MSFT")).resolves.toBeNull();
  });

  it("reuses a quote from the one-minute cache", async () => {
    process.env.FINNHUB_API_KEY = "test-key";
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ c: 100, dp: 0.5 }))
      .mockResolvedValueOnce(Response.json({ currency: "USD" }));
    vi.stubGlobal("fetch", fetcher);
    const { getMarketQuote } = await loadMarketData();

    const first = await getMarketQuote("MSFT");
    const second = await getMarketQuote("msft");
    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("deduplicates and normalizes batch ticker requests", async () => {
    process.env.FINNHUB_API_KEY = "test-key";
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ c: 100, dp: 1 }))
      .mockResolvedValueOnce(Response.json({ currency: "USD" }))
      .mockResolvedValueOnce(Response.json({ c: 200, dp: -1 }))
      .mockResolvedValueOnce(Response.json({ currency: "USD" }));
    vi.stubGlobal("fetch", fetcher);
    const { getMarketQuotes } = await loadMarketData();

    const result = await getMarketQuotes([" aapl ", "AAPL", "msft", ""]);
    expect(Object.keys(result)).toEqual(["AAPL", "MSFT"]);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});

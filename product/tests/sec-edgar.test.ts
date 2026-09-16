import { describe, expect, it, vi } from "vitest";
import { SecEdgarClient } from "../lib/ingestion/sec-edgar";

const tickers = {
  0: { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
};

const submissions = {
  filings: {
    recent: {
      accessionNumber: ["0000320193-26-000100", "0000320193-26-000099", "0000320193-25-000001"],
      filingDate: ["2026-09-15", "2026-09-14", "2025-01-01"],
      reportDate: ["2026-09-15", "2026-06-30", "2024-12-31"],
      acceptanceDateTime: ["2026-09-15T20:00:00Z", "2026-09-14T20:00:00Z", "2025-01-01T10:00:00Z"],
      form: ["8-K", "10-Q", "10-K"],
      items: ["2.02", "", ""],
      primaryDocument: ["aapl-20260915.htm", "aapl-20260630.htm", "old.htm"],
      isInlineXBRL: [1, 1, 1],
    },
    files: [],
  },
};

function client() {
  const fetcher = vi.fn(async (input: URL | RequestInfo) => {
    const url = String(input);
    if (url.endsWith("company_tickers.json")) return Response.json(tickers);
    if (url.includes("submissions/CIK0000320193.json")) return Response.json(submissions);
    if (url.includes("/Archives/edgar/data/320193/000032019326000100/aapl-20260915.htm")) {
      return new Response("<html><style>hidden</style><body><h1>Results</h1><p>Revenue increased.</p></body></html>");
    }
    return new Response("not found", { status: 404 });
  });
  return { fetcher, api: new SecEdgarClient({
    userAgent: "Vestory admin@example.com", fetcher, minIntervalMs: 0, unsafeDisableRateLimitForTests: true,
  }) };
}

describe("SEC EDGAR client", () => {
  it("requires a contact email in the SEC user agent", () => {
    expect(() => new SecEdgarClient({ userAgent: "Vestory" })).toThrow(/contact email/i);
    expect(() => new SecEdgarClient({ userAgent: "@" })).toThrow(/contact email/i);
  });

  it("resolves tickers, filters supported forms and ranks material filings", async () => {
    const { api, fetcher } = client();
    const filings = await api.listFilings({
      companies: [{ symbol: "aapl", portfolio: true }],
      since: new Date("2026-09-10T00:00:00Z"),
      now: new Date("2026-09-16T00:00:00Z"),
    });
    expect(filings).toHaveLength(2);
    expect(filings[0]).toMatchObject({ form: "8-K", cik: "0000320193", symbol: "AAPL" });
    expect(filings[0].primaryDocumentUrl).toBe(
      "https://www.sec.gov/Archives/edgar/data/320193/000032019326000100/aapl-20260915.htm",
    );
    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({
      redirect: "error",
      headers: expect.objectContaining({ "User-Agent": "Vestory admin@example.com" }),
    }));
  });

  it("skips an unresolved non-SEC symbol without suppressing valid companies", async () => {
    const { api } = client();
    const filings = await api.listFilings({
      companies: [{ symbol: "TASEONLY" }, { symbol: "AAPL", portfolio: true }],
      since: new Date("2026-09-10T00:00:00Z"),
      now: new Date("2026-09-16T00:00:00Z"),
    });
    expect(filings).toHaveLength(2);
    expect(filings.every((filing) => filing.symbol === "AAPL")).toBe(true);
  });

  it("fetches and normalizes the filing directly without an article provider", async () => {
    const { api } = client();
    const [filing] = await api.listFilings({
      companies: [{ symbol: "AAPL" }],
      since: new Date("2026-09-15T00:00:00Z"),
      now: new Date("2026-09-16T00:00:00Z"),
      limit: 1,
    });
    const document = await api.fetchFiling(filing);
    expect(document).toMatchObject({
      sourceSite: "sec_edgar",
      sourceKind: "financial_report",
      sourceId: "sec_edgar:0000320193-26-000100",
      symbols: ["AAPL"],
    });
    expect(document.content).toContain("Revenue increased.");
    expect(document.content).not.toContain("hidden");
  });

  it("hard caps each run at fifty filings even for invalid limits", async () => {
    const many = structuredClone(submissions);
    many.filings.recent = Object.fromEntries(Object.entries(submissions.filings.recent).map(([key, values]) => [
      key,
      Array.from({ length: 70 }, (_, index) => key === "accessionNumber"
        ? `0000320193-26-${String(index).padStart(6, "0")}`
        : key === "filingDate" ? "2026-09-15"
          : key === "form" ? "8-K"
            : key === "primaryDocument" ? `doc${index}.htm`
              : values[0]),
    ])) as typeof submissions.filings.recent;
    const fetcher = vi.fn(async (input: URL | RequestInfo) => (
      String(input).includes("submissions") ? Response.json(many) : Response.json(tickers)
    ));
    const api = new SecEdgarClient({
      userAgent: "Vestory admin@example.com", fetcher, minIntervalMs: 0, unsafeDisableRateLimitForTests: true,
    });
    const filings = await api.listFilings({
      companies: [{ symbol: "AAPL", cik: "320193" }],
      since: new Date("2026-09-10"),
      now: new Date("2026-09-16"),
      limit: Number.NaN,
    });
    expect(filings).toHaveLength(50);
  });

  it("uses acceptance time for non-midnight daily windows", async () => {
    const { api } = client();
    const filings = await api.listFilings({
      companies: [{ symbol: "AAPL" }],
      since: new Date("2026-09-15T07:00:00Z"),
      now: new Date("2026-09-16T00:00:00Z"),
    });
    expect(filings.map((filing) => filing.accessionNumber)).toContain("0000320193-26-000100");
  });

  it("rejects primary-document path traversal", async () => {
    const unsafe = structuredClone(submissions);
    unsafe.filings.recent.primaryDocument[0] = "%2e%2e/%2e%2e/evil.htm";
    const fetcher = vi.fn(async (input: URL | RequestInfo) => (
      String(input).includes("submissions") ? Response.json(unsafe) : Response.json(tickers)
    ));
    const api = new SecEdgarClient({
      userAgent: "Vestory admin@example.com", fetcher, unsafeDisableRateLimitForTests: true,
    });
    await expect(api.listFilings({
      companies: [{ symbol: "AAPL", cik: "320193" }], since: new Date("2026-09-10"), now: new Date("2026-09-16"),
    })).rejects.toThrow(/primary document path/i);
  });

  it("includes amended supported forms and ranks material 8-K items first", async () => {
    const amended = structuredClone(submissions);
    amended.filings.recent.form = ["8-K/A", "8-K", "S-1"];
    amended.filings.recent.items = ["4.02", "8.01", ""];
    const fetcher = vi.fn(async (input: URL | RequestInfo) => (
      String(input).includes("submissions") ? Response.json(amended) : Response.json(tickers)
    ));
    const api = new SecEdgarClient({
      userAgent: "Vestory admin@example.com", fetcher, unsafeDisableRateLimitForTests: true,
    });
    const filings = await api.listFilings({
      companies: [{ symbol: "AAPL", cik: "320193" }], since: new Date("2026-09-10"), now: new Date("2026-09-16"),
    });
    expect(filings.map((filing) => filing.form)).toEqual(["8-K/A", "8-K"]);
  });
});

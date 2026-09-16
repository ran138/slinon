import type { KnowledgeDocumentInput } from "./knowledge-pipeline";

const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const SUBMISSIONS_BASE = "https://data.sec.gov/submissions/";
const ARCHIVES_BASE = "https://www.sec.gov/Archives/edgar/data/";
const FORMS = new Set(["10-K", "10-Q", "8-K", "20-F", "40-F", "6-K"]);
const FORM_PRIORITY: Record<string, number> = {
  "8-K": 60,
  "6-K": 55,
  "10-Q": 50,
  "10-K": 45,
  "20-F": 40,
  "40-F": 35,
};
const MAX_RESPONSE_BYTES = 15 * 1024 * 1024;

type Fetcher = typeof fetch;

export interface TrackedCompany {
  symbol: string;
  cik?: string;
  name?: string;
  portfolio?: boolean;
}

export interface SecFilingCandidate {
  sourceId: string;
  accessionNumber: string;
  cik: string;
  symbol: string;
  companyName: string;
  form: string;
  filingDate: string;
  reportDate: string | null;
  acceptanceDateTime: string | null;
  primaryDocument: string;
  primaryDocumentUrl: string;
  filingIndexUrl: string;
  items: string | null;
  isInlineXbrl: boolean;
  score: number;
}

interface SecClientOptions {
  userAgent: string;
  fetcher?: Fetcher;
  minIntervalMs?: number;
  timeoutMs?: number;
  unsafeDisableRateLimitForTests?: boolean;
}

interface SubmissionColumns {
  accessionNumber?: unknown[];
  filingDate?: unknown[];
  reportDate?: unknown[];
  acceptanceDateTime?: unknown[];
  form?: unknown[];
  items?: unknown[];
  primaryDocument?: unknown[];
  isInlineXBRL?: unknown[];
}

function stringAt(values: unknown[] | undefined, index: number): string | null {
  const value = values?.[index];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeCik(value: string | number): string {
  const digits = String(value).replace(/\D/g, "");
  if (!digits || digits.length > 10) throw new Error("Invalid SEC CIK");
  return digits.padStart(10, "0");
}

function archiveUrl(cik: string, accession: string, primaryDocument: string): string {
  if (!/^\d{10}$/.test(cik) || !/^\d{10}-\d{2}-\d{6}$/.test(accession)) throw new Error("Invalid SEC filing identity");
  if (!primaryDocument || /[\\?#]/.test(primaryDocument)) {
    throw new Error("Invalid SEC primary document path");
  }
  const segments = primaryDocument.split("/");
  if (segments.some((part) => {
    if (!part) return true;
    try {
      const decoded = decodeURIComponent(part);
      return decoded === "." || decoded === ".." || /[\\/]/.test(decoded);
    } catch {
      return true;
    }
  })) throw new Error("Invalid SEC primary document path");
  const cikArchive = String(Number(cik));
  const accessionDirectory = accession.replaceAll("-", "");
  const prefix = `/Archives/edgar/data/${cikArchive}/${accessionDirectory}/`;
  const result = new URL(`${ARCHIVES_BASE}${cikArchive}/${accessionDirectory}/${primaryDocument}`);
  if (result.hostname !== "www.sec.gov" || !result.pathname.startsWith(prefix)) {
    throw new Error("Invalid SEC primary document path");
  }
  return result.toString();
}

function baseForm(form: string): string {
  return form.endsWith("/A") ? form.slice(0, -2) : form;
}

function materiality(form: string, items: string | null): number {
  if (baseForm(form) !== "8-K") return 0;
  const itemSet = new Set((items ?? "").split(",").map((item) => item.trim()));
  if (itemSet.has("4.02")) return 5;
  if (itemSet.has("2.01") || itemSet.has("1.01")) return 4;
  if (itemSet.has("2.02") || itemSet.has("2.06")) return 3;
  if (itemSet.has("4.01") || itemSet.has("5.02")) return 2;
  return itemSet.size ? 1 : 0;
}

let sharedRequestChain: Promise<void> = Promise.resolve();
let sharedLastRequestAt = 0;

async function boundedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error("SEC response is too large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("SEC response is too large");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, "\"")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export class SecEdgarClient {
  private readonly userAgent: string;
  private readonly fetcher: Fetcher;
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(options: SecClientOptions) {
    if (!/^[^@\s].*\s+[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(options.userAgent.trim())) {
      throw new Error("SEC_USER_AGENT must include an administrative contact email");
    }
    this.userAgent = options.userAgent.trim();
    this.fetcher = options.fetcher ?? fetch;
    this.minIntervalMs = options.unsafeDisableRateLimitForTests ? 0 : Math.max(100, options.minIntervalMs ?? 125);
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  private async throttle(): Promise<void> {
    const previous = sharedRequestChain;
    let release!: () => void;
    sharedRequestChain = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const wait = Math.max(0, sharedLastRequestAt + this.minIntervalMs - Date.now());
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    sharedLastRequestAt = Date.now();
    release();
  }

  private async get(url: string): Promise<Response> {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !["www.sec.gov", "data.sec.gov"].includes(parsed.hostname)) {
      throw new Error("SEC request host is not allowed");
    }
    await this.throttle();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.fetcher(parsed, {
        headers: {
          Accept: "application/json,text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "Accept-Encoding": "gzip, deflate",
          "User-Agent": this.userAgent,
        },
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (response.ok) return response;
      if (![403, 429, 500, 502, 503, 504].includes(response.status) || attempt === 2) {
        throw new Error(`SEC request failed with HTTP ${response.status}`);
      }
      const retryAfter = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) ? retryAfter * 1_000 : 250 * 2 ** attempt;
      if (this.minIntervalMs > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 5_000)));
      await this.throttle();
    }
    throw new Error("SEC request failed");
  }

  private async json(url: string): Promise<Record<string, unknown>> {
    const body = await boundedText(await this.get(url));
    try {
      const value = JSON.parse(body) as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
      return value as Record<string, unknown>;
    } catch (cause) {
      throw new Error("SEC returned invalid JSON", { cause });
    }
  }

  async resolveCompanies(companies: readonly TrackedCompany[]): Promise<Array<Required<Pick<TrackedCompany, "symbol" | "cik" | "name">> & { portfolio: boolean }>> {
    const unresolved = companies.some((company) => !company.cik);
    const lookup = new Map<string, { cik: string; name: string }>();
    if (unresolved) {
      const tickers = await this.json(TICKERS_URL);
      for (const value of Object.values(tickers)) {
        if (!value || typeof value !== "object") continue;
        const row = value as Record<string, unknown>;
        if (typeof row.ticker !== "string" || (typeof row.cik_str !== "number" && typeof row.cik_str !== "string")) continue;
        lookup.set(row.ticker.toUpperCase(), { cik: normalizeCik(row.cik_str), name: String(row.title ?? row.ticker) });
      }
    }
    return companies.flatMap((company) => {
      const symbol = company.symbol.trim().toUpperCase();
      const found = lookup.get(symbol);
      const cik = company.cik ? normalizeCik(company.cik) : found?.cik;
      if (!cik) return [];
      return [{ symbol, cik, name: company.name?.trim() || found?.name || symbol, portfolio: company.portfolio === true }];
    });
  }

  private rows(columns: SubmissionColumns): Array<Record<string, string | boolean | null>> {
    return (columns.accessionNumber ?? []).map((_, index) => ({
      accessionNumber: stringAt(columns.accessionNumber, index),
      filingDate: stringAt(columns.filingDate, index),
      reportDate: stringAt(columns.reportDate, index),
      acceptanceDateTime: stringAt(columns.acceptanceDateTime, index),
      form: stringAt(columns.form, index),
      items: stringAt(columns.items, index),
      primaryDocument: stringAt(columns.primaryDocument, index),
      isInlineXbrl: columns.isInlineXBRL?.[index] === 1 || columns.isInlineXBRL?.[index] === true,
    }));
  }

  async listFilings(options: {
    companies: readonly TrackedCompany[];
    since: Date;
    now?: Date;
    includeHistory?: boolean;
    limit?: number;
  }): Promise<SecFilingCandidate[]> {
    const now = options.now ?? new Date();
    const limit = Math.max(1, Math.min(50, Number.isFinite(options.limit) ? Math.trunc(options.limit!) : 50));
    const companies = await this.resolveCompanies(options.companies);
    const candidates: SecFilingCandidate[] = [];
    for (const [companyIndex, company] of companies.entries()) {
      const submission = await this.json(`${SUBMISSIONS_BASE}CIK${company.cik}.json`);
      const filings = submission.filings as Record<string, unknown> | undefined;
      const allRows = this.rows((filings?.recent ?? {}) as SubmissionColumns);
      if (options.includeHistory && Array.isArray(filings?.files)) {
        for (const file of filings.files) {
          if (!file || typeof file !== "object") continue;
          const record = file as Record<string, unknown>;
          if (typeof record.name !== "string" || !/^CIK\d{10}-submissions-\d{3}\.json$/.test(record.name)) continue;
          const from = typeof record.filingFrom === "string" ? Date.parse(record.filingFrom) : Number.NaN;
          const to = typeof record.filingTo === "string" ? Date.parse(record.filingTo) : Number.NaN;
          if (Number.isFinite(to) && to < options.since.getTime()) continue;
          if (Number.isFinite(from) && from > now.getTime()) continue;
          allRows.push(...this.rows(await this.json(`${SUBMISSIONS_BASE}${record.name}`) as SubmissionColumns));
        }
      }
      for (const row of allRows) {
        const form = row.form ? String(row.form) : "";
        const normalizedForm = baseForm(form);
        if (!FORMS.has(normalizedForm) || !row.accessionNumber || !row.filingDate || !row.primaryDocument) continue;
        const accepted = row.acceptanceDateTime ? Date.parse(String(row.acceptanceDateTime)) : Number.NaN;
        const filedDayEnd = Date.parse(`${String(row.filingDate)}T23:59:59.999Z`);
        const eventTime = Number.isFinite(accepted) ? accepted : filedDayEnd;
        if (!Number.isFinite(eventTime) || eventTime < options.since.getTime() || eventTime > now.getTime()) continue;
        const accession = String(row.accessionNumber);
        const primaryDocument = String(row.primaryDocument);
        const primaryDocumentUrl = archiveUrl(company.cik, accession, primaryDocument);
        const cikArchive = String(Number(company.cik));
        const ageDays = Math.max(0, (now.getTime() - eventTime) / 86_400_000);
        candidates.push({
          sourceId: `sec_edgar:${accession}`,
          accessionNumber: accession,
          cik: company.cik,
          symbol: company.symbol,
          companyName: company.name,
          form,
          filingDate: String(row.filingDate),
          reportDate: row.reportDate ? String(row.reportDate) : null,
          acceptanceDateTime: row.acceptanceDateTime ? String(row.acceptanceDateTime) : null,
          primaryDocument,
          primaryDocumentUrl,
          filingIndexUrl: `${ARCHIVES_BASE}${cikArchive}/${accession}-index.html`,
          items: row.items ? String(row.items) : null,
          isInlineXbrl: row.isInlineXbrl === true,
          score: (FORM_PRIORITY[normalizedForm] ?? 0) + materiality(form, row.items ? String(row.items) : null)
            + Math.max(0, 20 - ageDays / 18.25)
            + (company.portfolio ? 10 : 0) + Math.max(0, (companies.length - companyIndex) / 100),
        });
      }
    }
    return [...new Map(candidates.map((candidate) => [candidate.accessionNumber, candidate])).values()]
      .sort((left, right) => {
        const formDifference = (FORM_PRIORITY[baseForm(right.form)] ?? 0) - (FORM_PRIORITY[baseForm(left.form)] ?? 0);
        if (formDifference) return formDifference;
        const materialityDifference = materiality(right.form, right.items) - materiality(left.form, left.items);
        if (materialityDifference) return materialityDifference;
        const rightTime = Date.parse(right.acceptanceDateTime ?? `${right.filingDate}T23:59:59.999Z`);
        const leftTime = Date.parse(left.acceptanceDateTime ?? `${left.filingDate}T23:59:59.999Z`);
        if (rightTime !== leftTime) return rightTime - leftTime;
        return right.score - left.score;
      })
      .slice(0, limit);
  }

  async fetchFiling(candidate: SecFilingCandidate): Promise<KnowledgeDocumentInput> {
    const content = htmlToText(await boundedText(await this.get(candidate.primaryDocumentUrl)));
    if (!content) throw new Error("SEC filing document is empty");
    return {
      sourceSite: "sec_edgar",
      sourceKind: "financial_report",
      sourceId: candidate.sourceId,
      canonicalUrl: candidate.primaryDocumentUrl,
      sourceUrl: candidate.primaryDocumentUrl,
      title: `${candidate.companyName} ${candidate.form} filed ${candidate.filingDate}`,
      content,
      publishedAt: candidate.acceptanceDateTime ?? `${candidate.filingDate}T00:00:00.000Z`,
      symbols: [candidate.symbol],
      topics: ["financial_reports", candidate.form],
      metadata: { filingIndexUrl: candidate.filingIndexUrl },
      sourceMetadata: {
        accessionNumber: candidate.accessionNumber,
        cik: candidate.cik,
        form: candidate.form,
        reportDate: candidate.reportDate,
        items: candidate.items,
        isInlineXbrl: candidate.isInlineXbrl,
      },
    };
  }
}

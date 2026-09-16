// Shared onboarding metadata: use the same canonical tickers in search and parsing.
export const POPULAR_ASSETS: { ticker: string; name: string; nameHe?: string; secNum?: string; aliases?: string[] }[] = [
  { ticker: "NVDA", name: "NVIDIA", nameHe: "אנבידיה", aliases: ["אינווידיה", "נווידיה"] },
  { ticker: "AAPL", name: "Apple", nameHe: "אפל" },
  { ticker: "MSFT", name: "Microsoft", nameHe: "מיקרוסופט" },
  { ticker: "TSLA", name: "Tesla", nameHe: "טסלה" },
  { ticker: "META", name: "Meta", nameHe: "מטא" },
  { ticker: "AMZN", name: "Amazon", nameHe: "אמזון" },
  { ticker: "GOOGL", name: "Alphabet (Google)", nameHe: "אלפבית", aliases: ["Google"] },
  { ticker: "AMD", name: "AMD" }, { ticker: "INTC", name: "Intel", nameHe: "אינטל" },
  { ticker: "NFLX", name: "Netflix", nameHe: "נטפליקס" }, { ticker: "ORCL", name: "Oracle" },
  { ticker: "CRM", name: "Salesforce" }, { ticker: "ADBE", name: "Adobe" },
  { ticker: "PLTR", name: "Palantir" }, { ticker: "COIN", name: "Coinbase" },
  { ticker: "SPY", name: "S&P 500 ETF (SPY)", aliases: ["S&P 500"] },
  { ticker: "QQQ", name: "Nasdaq 100 ETF (QQQ)", aliases: ["Nasdaq 100"] },
  { ticker: "VOO", name: "Vanguard S&P 500 (VOO)" },
  { ticker: "BTC", name: "Bitcoin", nameHe: "ביטקוין" },
  { ticker: "ETH", name: "Ethereum", nameHe: "אתריום" }, { ticker: "SOL", name: "Solana" },
  { ticker: "TASE:NICE", name: "Nice Systems", nameHe: "נייס סיסטמס", secNum: "1122127" },
  { ticker: "TASE:FIBI", name: "First International Bank", nameHe: "בנק הפועלים הבינלאומי", secNum: "604611" },
  { ticker: "TASE:TEVA", name: "Teva", nameHe: "טבע", secNum: "1120300" },
  { ticker: "TASE:CHKP", name: "Check Point", nameHe: "צ'ק פוינט", secNum: "1084761" },
  { ticker: "TASE:WIXL", name: "Wix", nameHe: "ויקס", secNum: "1141783" },
  { ticker: "TASE:MNDY", name: "Monday.com", nameHe: "מאנדיי", secNum: "1201605" },
];

export const INTERESTS = [
  { id: "טכנולוגיה", label: "טכנולוגיה", aliases: ["technology"] },
  { id: "AI", label: "AI", aliases: ["בינה מלאכותית", "artificial intelligence"] },
  { id: "קריפטו", label: "קריפטו", aliases: ["crypto"] },
  { id: "ריבית ואינפלציה", label: "ריבית ואינפלציה", aliases: ["inflation", "interest rates", "אינפלציה", "ריבית"] },
  { id: "כלכלת ישראל", label: "כלכלת ישראל", aliases: ["israel economy"] },
  { id: "כלכלה עולמית", label: "כלכלה עולמית", aliases: ["global economy"] },
  { id: "שוק הנדל״ן", label: "שוק הנדל״ן", aliases: ["real estate", "נדלן"] },
  { id: "אנרגיה", label: "אנרגיה", aliases: ["energy"] },
  { id: 'מט"ח', label: 'מט"ח', aliases: ["forex"] },
  { id: 'אג"ח', label: 'אג"ח', aliases: ["bonds"] },
  { id: "ביוטק ופארמה", label: "ביוטק ופארמה", aliases: ["biotech", "biotechnology", "ביוטק"] },
  { id: "שבבים", label: "שבבים", aliases: ["semiconductors"] },
];
const extraTopics = [{ id: "זהב", aliases: ["זהב", "gold"] }];

export function conceptKey(text: string) {
  return text.normalize("NFKC").toLocaleLowerCase().replace(/[\u0591-\u05bd\u05bf-\u05c7]/g, "").replace(/[^\p{L}\p{N}]/gu, "");
}

// Damerau-Levenshtein: tolerate one insertion/deletion/substitution/transposition.
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}

type Candidate<T> = { item: T; names: string[] };
function confidentMatch<T>(text: string, candidates: Candidate<T>[], fuzzy = true): T | undefined {
  const key = conceptKey(text);
  if (!key) return undefined;
  const exact = candidates.filter(({ names }) => names.some((name) => conceptKey(name) === key));
  if (exact.length) return exact.length === 1 ? exact[0].item : undefined;
  // Short aliases/tickers are never autocorrected; multiple plausible matches stay unresolved.
  if (!fuzzy || key.length < 5) return undefined;
  const matches = candidates.filter(({ names }) => names.some((name) => {
    const alias = conceptKey(name);
    return alias.length >= 5 && Math.abs(alias.length - key.length) <= 1 && editDistance(alias, key) <= 1;
  }));
  return matches.length === 1 ? matches[0].item : undefined;
}
const assetCandidates = POPULAR_ASSETS.map((item) => ({ item, names: [item.ticker, item.name, item.nameHe ?? "", item.secNum ?? "", ...item.aliases ?? []] }));
const topicCandidates = [...INTERESTS, ...extraTopics].map((item) => ({ item: item.id, names: [item.id, ...item.aliases] }));
export function matchAsset(text: string, fuzzy = true) { return confidentMatch(text, assetCandidates, fuzzy); }
export function matchInterest(text: string, fuzzy = true) { return confidentMatch(text, topicCandidates, fuzzy); }
export function normalizeInterests(values: string[]) {
  return Array.from(new Map(values.map((value) => {
    const label = matchInterest(value) ?? value.trim();
    return [conceptKey(label), label] as const;
  }).filter(([key]) => key)).values());
}
export function searchAssets(query: string) {
  const q = conceptKey(query);
  if (!q) return [];
  return assetCandidates.map(({ item, names }) => {
    const keys = names.map(conceptKey).filter(Boolean);
    const score = keys.some((key) => key === q) ? 0 : keys.some((key) => key.includes(q)) ? 1 : q.length >= 5 && keys.some((key) => key.length >= 5 && Math.abs(key.length - q.length) <= 1 && editDistance(key, q) <= 1) ? 2 : 3;
    return { item, score };
  }).filter(({ score }) => score < 3).sort((a, b) => a.score - b.score).map(({ item }) => item).slice(0, 8);
}
export function searchInterests(query: string) {
  const q = conceptKey(query);
  if (!q) return [];
  return INTERESTS.filter((item) => [item.id, ...item.aliases].some((alias) => {
    const key = conceptKey(alias);
    return key.includes(q) || (q.length >= 5 && key.length >= 5 && Math.abs(key.length - q.length) <= 1 && editDistance(key, q) <= 1);
  }));
}

export function parseOnboardingText(text: string) {
  const assets: { name: string; symbol: string; quantity: null; averageCost: null; currency: null }[] = [];
  const interests: string[] = [];
  type Match =
    | { kind: "asset"; value: NonNullable<ReturnType<typeof matchAsset>> }
    | { kind: "interest"; value: string };
  function classify(value: string, fuzzy = true): Match | null {
    const asset = matchAsset(value, fuzzy);
    const topic = matchInterest(value, fuzzy);
    if (asset && !topic) return { kind: "asset", value: asset };
    if (topic && !asset) return { kind: "interest", value: topic };
    return null;
  }
  function record(match: Match) {
    if (match.kind === "asset") {
      assets.push({ name: match.value.name, symbol: match.value.ticker, quantity: null, averageCost: null, currency: null });
    } else {
      interests.push(match.value);
    }
  }
  function add(value: string, fuzzy = true) {
    const match = classify(value, fuzzy);
    if (!match) return false;
    record(match);
    return true;
  }
  for (const chunk of text.split(/[,;\n،]+/).map((v) => v.trim()).filter(Boolean)) {
    if (add(chunk)) continue;
    const words = chunk.split(/\s+/);
    const segments: { words: string[]; match: Match | null }[] = [];
    for (let i = 0; i < words.length;) {
      let count = Math.min(5, words.length - i);
      let match: Match | null = null;
      while (count > 0 && !match) {
        match = classify(words.slice(i, i + count).join(" "), false);
        if (!match) count--;
      }
      if (match) {
        segments.push({ words: words.slice(i, i + count), match });
        i += count;
      } else {
        segments.push({ words: [words[i]], match: null });
        i++;
      }
    }
    if (segments.every((segment) => segment.match)) {
      for (const segment of segments) record(segment.match!);
      continue;
    }
    let customWords: string[] = [];
    const flushCustomInterest = () => {
      if (customWords.length) interests.push(customWords.join(" "));
      customWords = [];
    };
    for (const segment of segments) {
      if (segment.match?.kind === "asset") {
        flushCustomInterest();
        record(segment.match);
      } else {
        customWords.push(...segment.words);
      }
    }
    flushCustomInterest();
  }
  return { assets: Array.from(new Map(assets.map((asset) => [asset.symbol, asset])).values()), interests: normalizeInterests(interests) };
}

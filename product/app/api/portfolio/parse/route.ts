import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
const parsedPortfolioInput = z.object({
  assets: z.array(z.object({
    name: z.string(),
    symbol: z.string(),
    quantity: z.string().nullable(),
    averageCost: z.string().nullable(),
    currency: z.string().nullable(),
  })).max(20),
  interests: z.array(z.string().trim().min(1).max(80)).max(20),
});

const aliases: Record<string, { name: string; symbol: string }> = {
  nvidia: { name: "NVIDIA", symbol: "NVDA" }, nvda: { name: "NVIDIA", symbol: "NVDA" },
  "אינווידיה": { name: "NVIDIA", symbol: "NVDA" }, "נווידיה": { name: "NVIDIA", symbol: "NVDA" }, "אנבידיה": { name: "NVIDIA", symbol: "NVDA" },
  apple: { name: "Apple", symbol: "AAPL" }, aapl: { name: "Apple", symbol: "AAPL" },
  bitcoin: { name: "Bitcoin", symbol: "BTC" }, btc: { name: "Bitcoin", symbol: "BTC" },
  "s&p 500": { name: "S&P 500", symbol: "SPY" },
};

const interestAliases: Record<string, string> = {
  ai: "AI",
  "בינה מלאכותית": "AI",
  technology: "טכנולוגיה",
  "טכנולוגיה": "טכנולוגיה",
  gold: "זהב",
  "זהב": "זהב",
  inflation: "ריבית ואינפלציה",
  "אינפלציה": "ריבית ואינפלציה",
  "real estate": "שוק הנדל״ן",
  "נדלן": "שוק הנדל״ן",
  "נדל״ן": "שוק הנדל״ן",
};

function findKnownAssets(text: string) {
  const lower = text.toLowerCase();
  const matches = Object.entries(aliases)
    .filter(([key]) => lower.includes(key))
    .map(([, item]) => ({ ...item, quantity: null, averageCost: null, currency: null }));
  return Array.from(new Map(matches.map((item) => [item.symbol, item])).values());
}

function findKnownInterests(text: string) {
  const lower = text.toLocaleLowerCase();
  return Array.from(new Set(
    Object.entries(interestAliases).filter(([key]) => lower.includes(key)).map(([, label]) => label),
  ));
}

function normalizeAsset(asset: { name: string; symbol: string; quantity: string | null; averageCost: string | null; currency: string | null }) {
  const known = aliases[asset.symbol.toLowerCase()] ?? aliases[asset.name.toLowerCase()];
  return {
    name: known?.name ?? asset.name.trim(),
    symbol: (known?.symbol ?? asset.symbol).trim().toUpperCase(),
    quantity: asset.quantity?.trim() || null,
    averageCost: asset.averageCost?.trim() || null,
    currency: asset.currency?.trim() || null,
  };
}

export async function POST(request: Request) {
  const isLocalPreview = process.env.LOCAL_PREVIEW === "true" && new URL(request.url).searchParams.get("preview") === "onboarding";
  if (!isLocalPreview) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { text } = z.object({ text: z.string().trim().min(1).max(2000) }).parse(await request.json());
  const knownAssets = findKnownAssets(text);
  const knownInterests = findKnownInterests(text);
  if (isLocalPreview) {
    return NextResponse.json({
      assets: knownAssets,
      interests: knownInterests.length || knownAssets.length ? knownInterests : [text.slice(0, 80)],
      localPreview: true,
    });
  }
  if (!process.env.OPENAI_API_KEY) {
    if (knownAssets.length || knownInterests.length) {
      return NextResponse.json({ assets: knownAssets, interests: knownInterests, localMatch: true });
    }
    return NextResponse.json({ assets: [], interests: [text.slice(0, 80)], localFallback: true });
  }
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30_000 });
    const result = await client.responses.parse({
      model: process.env.OPENAI_TEXT_MODEL ?? "gpt-5.6-terra",
      store: false,
      input: `Classify the items explicitly present in this onboarding text into assets and broader investment interests. Assets are securities, funds, indexes, companies, currencies, or cryptocurrencies that can be held or followed; include their symbol when known. Interests are broader subjects such as technology, AI, inflation, gold, or real estate. Never invent an item or numeric value. Do not include the same item as both an asset and an interest. Use null for omitted optional asset data. Text: ${text}`,
      text: { format: zodTextFormat(parsedPortfolioInput, "portfolio_input") },
    });
    const assets = (result.output_parsed?.assets ?? []).map(normalizeAsset).filter((asset) => asset.name && asset.symbol);
    const interests = Array.from(new Set(result.output_parsed?.interests ?? []));
    return NextResponse.json({ assets, interests });
  } catch {
    return NextResponse.json({ error: "לא הצלחנו לזהות את הנכסים והנושאים. אפשר לנסות שוב או להזין ניסוח ברור יותר." }, { status: 502 });
  }
}

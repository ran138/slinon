import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
const parsedAssets = z.object({ assets: z.array(z.object({ name: z.string(), symbol: z.string(), quantity: z.string().nullable(), averageCost: z.string().nullable(), currency: z.string().nullable() })).max(20) });

const aliases: Record<string, { name: string; symbol: string }> = {
  nvidia: { name: "NVIDIA", symbol: "NVDA" }, nvda: { name: "NVIDIA", symbol: "NVDA" },
  "אינווידיה": { name: "NVIDIA", symbol: "NVDA" }, "נווידיה": { name: "NVIDIA", symbol: "NVDA" }, "אנבידיה": { name: "NVIDIA", symbol: "NVDA" },
  apple: { name: "Apple", symbol: "AAPL" }, aapl: { name: "Apple", symbol: "AAPL" },
  bitcoin: { name: "Bitcoin", symbol: "BTC" }, btc: { name: "Bitcoin", symbol: "BTC" },
  "s&p 500": { name: "S&P 500", symbol: "SPY" },
};

function findKnownAssets(text: string) {
  const lower = text.toLowerCase();
  const matches = Object.entries(aliases)
    .filter(([key]) => lower.includes(key))
    .map(([, item]) => ({ ...item, quantity: null, averageCost: null, currency: null }));
  return Array.from(new Map(matches.map((item) => [item.symbol, item])).values());
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
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { text } = z.object({ text: z.string().trim().min(1).max(2000) }).parse(await request.json());
  const knownAssets = findKnownAssets(text);
  if (knownAssets.length) return NextResponse.json({ assets: knownAssets, localMatch: true });
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ assets: [{ name: text.slice(0, 100), symbol: text.slice(0, 12).toUpperCase(), quantity: null, averageCost: null, currency: null }], localFallback: true });
  }
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30_000 });
    const result = await client.responses.parse({
      model: process.env.OPENAI_TEXT_MODEL ?? "gpt-5.6-terra",
      store: false,
      input: `Extract only the investments explicitly present in this text. Never add an asset or a numeric value. Use null for omitted optional data. Text: ${text}`,
      text: { format: zodTextFormat(parsedAssets, "portfolio_assets") },
    });
    const assets = (result.output_parsed?.assets ?? []).map(normalizeAsset).filter((asset) => asset.name && asset.symbol);
    return NextResponse.json({ assets });
  } catch {
    return NextResponse.json({ error: "לא הצלחנו לזהות את הנכסים. אפשר לנסות שוב או להזין סימול ברור." }, { status: 502 });
  }
}

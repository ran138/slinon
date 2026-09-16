import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { getCurrentUser } from "@/lib/auth";
import { conceptKey, matchAsset, matchInterest, normalizeInterests, parseOnboardingText } from "@/lib/onboarding";

export const runtime = "nodejs";
const portfolioOutputFormat = z.object({
  assets: z.array(z.object({
    name: z.string(),
    symbol: z.string(),
    quantity: z.string().nullable(),
    averageCost: z.string().nullable(),
    currency: z.string().nullable(),
  })),
  interests: z.array(z.string()),
});
const parsedPortfolioInput = portfolioOutputFormat.extend({
  assets: portfolioOutputFormat.shape.assets.max(20),
  interests: z.array(z.string().trim().min(1).max(80)).max(20),
});

function normalizeAsset(asset: { name: string; symbol: string; quantity: string | null; averageCost: string | null; currency: string | null }) {
  const known = matchAsset(asset.symbol, false) ?? matchAsset(asset.name, false);
  return {
    name: known?.name ?? asset.name.trim(),
    symbol: (known?.ticker ?? asset.symbol).trim().toUpperCase(),
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
  const fallback = parseOnboardingText(text);
  function fallbackResponse(localPreview = false) {
    if (fallback.interests.some((label) => label.length > 80)) {
      return NextResponse.json({ error: "נושא אישי יכול להכיל עד 80 תווים. פצלו נושאים ארוכים באמצעות פסיקים כדי שנוכל לשמור את כולם." }, { status: 400 });
    }
    return NextResponse.json({ ...fallback, ...(localPreview ? { localPreview: true } : { localFallback: true }) });
  }
  if (isLocalPreview) {
    return fallbackResponse(true);
  }
  if (!process.env.OPENAI_API_KEY) {
    return fallbackResponse();
  }
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30_000 });
    const result = await client.responses.parse({
      model: process.env.OPENAI_TEXT_MODEL ?? "gpt-5.6-terra",
      store: false,
      input: [
        { role: "system", content: "Classify every meaningful concept in the user's onboarding text into assets and broader investment interests. Assets are securities, funds, indexes, companies, currencies or cryptocurrencies; use a symbol only when confident. Preserve commodities, sectors, industries, macro topics and unknown/custom investment interests as interests, not invented assets. Keep semantic noun phrases such as green energy, digital health or smart agriculture intact as one interest; never split a meaningful phrase into separate words. Correct minor spelling mistakes only when unambiguous; otherwise preserve the original topic for confirmation. Normalize confident company/ticker aliases and index spacing variants. Never drop an unresolved concept or invent an item/numeric value. Do not include the same concept in both lists. Use null for omitted optional asset data." },
        { role: "user", content: text },
      ],
      text: { format: zodTextFormat(portfolioOutputFormat, "portfolio_input") },
    });
    if (!result.output_parsed) return fallbackResponse();
    const validated = parsedPortfolioInput.safeParse(result.output_parsed);
    if (!validated.success) return fallbackResponse();
    const parsed = validated.data;
    const topicLikeAssets = parsed.assets.filter((asset) => !asset.symbol.trim() || (matchInterest(asset.name, false) && !matchAsset(asset.name, false)));
    const assets = Array.from(new Map([...fallback.assets, ...parsed.assets.filter((asset) => !topicLikeAssets.includes(asset)).map(normalizeAsset).filter((asset) => asset.name && asset.symbol)]
      .map((asset) => [conceptKey(asset.symbol), asset])).values());
    const recognized = [...assets.flatMap((asset) => [asset.name, asset.symbol]), ...parsed.interests].map(conceptKey).filter(Boolean);
    const preserved = fallback.interests.filter((label) => !recognized.some((key) => conceptKey(label) === key));
    const interests = normalizeInterests([...parsed.interests, ...topicLikeAssets.map((asset) => asset.name), ...preserved])
      .filter((label) => !assets.some((asset) => conceptKey(asset.name) === conceptKey(label) || matchAsset(label, false)?.ticker === asset.symbol));
    if (interests.some((label) => label.length > 80)) return fallbackResponse();
    return NextResponse.json({ assets, interests });
  } catch {
    return fallbackResponse();
  }
}

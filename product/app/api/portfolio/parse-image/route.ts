import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

const parsedAssets = z.object({
  assets: z.array(z.object({ name: z.string(), symbol: z.string(), quantity: z.string().nullable(), averageCost: z.string().nullable(), currency: z.string().nullable() })).max(30),
});

function normalizeAsset(asset: z.infer<typeof parsedAssets>["assets"][number]) {
  return {
    name: asset.name.trim(),
    symbol: asset.symbol.trim().toUpperCase(),
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

  const { imageDataUrl } = z.object({ imageDataUrl: z.string().startsWith("data:image/") }).parse(await request.json());

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "זיהוי תמונות אינו זמין כרגע (חסר מפתח OpenAI)." }, { status: 502 });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45_000 });
    const result = await client.responses.parse({
      model: process.env.OPENAI_TEXT_MODEL ?? "gpt-5.6-terra",
      store: false,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "This is a screenshot of an investment portfolio or brokerage account. Extract only the holdings that are clearly visible and legible. Never invent a position, quantity, or value that isn't shown. Use null for any field you cannot read with confidence." },
            { type: "input_image", image_url: imageDataUrl, detail: "high" },
          ],
        },
      ],
      text: { format: zodTextFormat(parsedAssets, "portfolio_assets") },
    });
    const assets = (result.output_parsed?.assets ?? []).map(normalizeAsset).filter((asset) => asset.name && asset.symbol);
    return NextResponse.json({ assets });
  } catch {
    return NextResponse.json({ error: "לא הצלחנו לנתח את התמונה. אפשר לנסות תמונה ברורה יותר או להזין ידנית." }, { status: 502 });
  }
}

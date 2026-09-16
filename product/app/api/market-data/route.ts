import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMarketQuotes } from "@/lib/marketData";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tickers = (new URL(request.url).searchParams.get("tickers") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);
  if (!tickers.length) return NextResponse.json({});

  const quotes = await getMarketQuotes(tickers);
  return NextResponse.json(quotes, { headers: { "Cache-Control": "private, max-age=30" } });
}

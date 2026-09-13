import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, rawDb } from "@/db";
import { assets, interests, settings } from "@/db/schema";
import { profileUpdateSchema } from "@/lib/domain";

export const runtime = "nodejs";

export async function GET() {
  const [current] = await db.select().from(settings).where(eq(settings.id, 1));
  return NextResponse.json({
    targetMinutes: current?.targetMinutes ?? 7,
    onboardingComplete: current?.onboardingComplete ?? false,
    assets: await db.select().from(assets),
    interests: await db.select().from(interests),
  });
}

export async function PUT(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ error: "origin_not_allowed" }, { status: 403 });
  }
  const parsed = profileUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_profile" }, { status: 400 });
  const value = parsed.data;
  const now = new Date().toISOString();
  const replace = rawDb.transaction(() => {
    rawDb.prepare("DELETE FROM assets").run();
    rawDb.prepare("DELETE FROM interests").run();
    const assetStatement = rawDb.prepare("INSERT INTO assets (id, kind, name, symbol, asset_class, exchange, quantity, average_cost, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const item of value.assets) assetStatement.run(item.id ?? crypto.randomUUID(), item.kind, item.name, item.symbol, item.assetClass ?? null, item.exchange ?? null, item.quantity ?? null, item.averageCost ?? null, item.currency ?? null, now, now);
    const interestStatement = rawDb.prepare("INSERT INTO interests (id, label, custom, created_at) VALUES (?, ?, ?, ?)");
    for (const item of value.interests) interestStatement.run(crypto.randomUUID(), item.label, item.custom ? 1 : 0, now);
    rawDb.prepare("UPDATE settings SET target_minutes = ?, onboarding_complete = ?, updated_at = ? WHERE id = 1").run(value.targetMinutes, value.onboardingComplete ? 1 : 0, now);
  });
  replace();
  return GET();
}

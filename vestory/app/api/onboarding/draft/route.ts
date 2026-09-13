import { NextResponse } from "next/server";
import { z } from "zod";
import { rawDb } from "@/db";
import { assetInputSchema } from "@/lib/domain";

export const runtime = "nodejs";

const draftSchema = z.object({
  text: z.string().max(2000),
  assets: z.array(assetInputSchema.extend({ kind: z.literal("holding") })).max(20),
});

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || new URL(origin).host === request.headers.get("host");
}

export async function GET() {
  const row = rawDb.prepare("SELECT portfolio_text, assets_json FROM onboarding_draft WHERE id = 1").get() as { portfolio_text: string; assets_json: string } | undefined;
  if (!row) return NextResponse.json({ text: "", assets: [] });
  try {
    return NextResponse.json({ text: row.portfolio_text, assets: JSON.parse(row.assets_json) });
  } catch {
    return NextResponse.json({ text: "", assets: [] });
  }
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "origin_not_allowed" }, { status: 403 });
  const parsed = draftSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_draft" }, { status: 400 });
  rawDb.prepare("INSERT INTO onboarding_draft (id, portfolio_text, assets_json, updated_at) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET portfolio_text = excluded.portfolio_text, assets_json = excluded.assets_json, updated_at = excluded.updated_at")
    .run(parsed.data.text, JSON.stringify(parsed.data.assets), new Date().toISOString());
  return NextResponse.json(parsed.data);
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "origin_not_allowed" }, { status: 403 });
  rawDb.prepare("DELETE FROM onboarding_draft WHERE id = 1").run();
  return new NextResponse(null, { status: 204 });
}

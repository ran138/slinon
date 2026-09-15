import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthClient } from "@/lib/auth";

export const runtime = "nodejs";

const schema = z.object({ password: z.string().min(8).max(72) });

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ error: "origin_not_allowed" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const supabase = await getAuthClient();
  // Requires an active (recovery) session — established by /auth/callback
  // exchanging the emailed reset link's code just before this is called.
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return NextResponse.json({ error: error.code ?? "update_password_failed" }, { status: 400 });
  return NextResponse.json({ ok: true });
}

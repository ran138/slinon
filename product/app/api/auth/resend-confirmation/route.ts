import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthClient } from "@/lib/auth";

export const runtime = "nodejs";

const schema = z.object({ email: z.string().trim().email() });

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ error: "origin_not_allowed" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const supabase = await getAuthClient();
  await supabase.auth.resend({ type: "signup", email: parsed.data.email });
  return NextResponse.json({ ok: true });
}

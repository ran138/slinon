import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthClient } from "@/lib/auth";

export const runtime = "nodejs";

const schema = z.object({ email: z.string().trim().email(), password: z.string().min(8).max(72) });

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ error: "origin_not_allowed" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const supabase = await getAuthClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${origin ?? new URL(request.url).origin}/auth/callback` },
  });
  if (error) return NextResponse.json({ error: error.code ?? "sign_up_failed" }, { status: 400 });

  // No session yet means email confirmation is required (project setting) —
  // the account exists but can't do anything until confirmed.
  const needsConfirmation = !data.session;
  return NextResponse.json({ ok: true, needsConfirmation });
}

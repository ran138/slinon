import { NextResponse } from "next/server";
import { getAuthClient } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type"); // "recovery" for password-reset links
  const next = url.searchParams.get("next");

  if (code) {
    const supabase = await getAuthClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (type === "recovery") return NextResponse.redirect(new URL("/reset-password/confirm", request.url));
      const dest = next && next.startsWith("/") ? next : "/vestory_app";
      return NextResponse.redirect(new URL(dest, request.url));
    }
  }
  return NextResponse.redirect(new URL("/login?error=auth_callback_failed", request.url));
}

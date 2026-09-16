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
    console.error("[auth/callback] exchangeCodeForSession failed", error.message);
    return NextResponse.redirect(new URL("/login?error=auth_callback_failed", request.url));
  }

  // Supabase redirects here with error/error_code/error_description (no
  // code) when the upstream provider exchange itself failed — e.g. GitHub
  // rejected the token exchange. Logged server-side only — the user never
  // sees these protocol-level details, just a plain failure message.
  const upstreamError = url.searchParams.get("error");
  if (upstreamError) {
    console.error("[auth/callback] upstream OAuth error", {
      error: upstreamError,
      error_code: url.searchParams.get("error_code"),
      error_description: url.searchParams.get("error_description"),
    });
  }

  return NextResponse.redirect(new URL("/login?error=auth_callback_failed", request.url));
}

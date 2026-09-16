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
    const failDest = new URL("/login", request.url);
    failDest.searchParams.set("error", "auth_callback_failed");
    failDest.searchParams.set("detail", error.message);
    return NextResponse.redirect(failDest);
  }

  // Supabase redirects here with error/error_code/error_description (no
  // code) when the upstream provider exchange itself failed — e.g. GitHub
  // rejected the token exchange. These are protocol-level diagnostic
  // strings, not secrets — surfaced in the redirect URL too (not just
  // logged) so this is diagnosable without needing platform log access.
  const upstreamError = url.searchParams.get("error");
  if (upstreamError) {
    const errorCode = url.searchParams.get("error_code");
    const description = url.searchParams.get("error_description");
    console.error("[auth/callback] upstream OAuth error", { error: upstreamError, error_code: errorCode, error_description: description });
    const failDest = new URL("/login", request.url);
    failDest.searchParams.set("error", "auth_callback_failed");
    failDest.searchParams.set("detail", `${errorCode ?? upstreamError}: ${description ?? ""}`);
    return NextResponse.redirect(failDest);
  }

  return NextResponse.redirect(new URL("/login?error=auth_callback_failed", request.url));
}

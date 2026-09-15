import { NextResponse } from "next/server";
import { getAuthClient } from "@/lib/auth";

export const runtime = "nodejs";

const SUPPORTED_PROVIDERS = ["google", "github"] as const;
type Provider = (typeof SUPPORTED_PROVIDERS)[number];

function isSupportedProvider(value: string): value is Provider {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(value);
}

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isSupportedProvider(provider)) {
    return NextResponse.redirect(new URL("/login?error=unsupported_provider", request.url));
  }

  const next = new URL(request.url).searchParams.get("next");
  const redirectTo = new URL("/auth/callback", request.url);
  if (next) redirectTo.searchParams.set("next", next);

  const supabase = await getAuthClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: redirectTo.toString(), skipBrowserRedirect: true },
  });
  if (error || !data.url) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
  }
  return NextResponse.redirect(data.url);
}

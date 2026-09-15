import { NextResponse } from "next/server";
import { getAuthClient } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ error: "origin_not_allowed" }, { status: 403 });
  }
  const supabase = await getAuthClient();
  await supabase.auth.signOut();
  return new NextResponse(null, { status: 204 });
}

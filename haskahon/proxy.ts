import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase().replace(/^\[|\]$/g, "").split(":")[0];
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(host)) {
    return NextResponse.json({ error: "local_access_only" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/:path*" };

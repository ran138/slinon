import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  // Keep a single middleware entry point for future domain-level policies.
  // The application is intentionally available on the public Vercel hostname.
  void request;
  return NextResponse.next();
}

export const config = { matcher: "/:path*" };

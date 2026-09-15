import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Exact paths only — NOT prefix-matched. In particular /reset-password/confirm
// is deliberately excluded: a logged-in user lands there via a real recovery
// session (the emailed link's code-exchange in /auth/callback), and must be
// allowed to actually set a new password rather than get bounced to the app.
const AUTH_PATHS = ["/login", "/signup", "/reset-password"];

export async function proxy(request: NextRequest) {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  if (!user && path.startsWith("/vestory_app")) {
    const nextPath = path + request.nextUrl.search;
    const dest = request.nextUrl.clone();
    dest.pathname = "/login";
    dest.search = "";
    dest.searchParams.set("next", nextPath);
    return NextResponse.redirect(dest);
  }
  if (user && AUTH_PATHS.includes(path)) {
    const dest = request.nextUrl.clone();
    dest.pathname = "/vestory_app";
    dest.search = "";
    return NextResponse.redirect(dest);
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|ico|txt|xml)$).*)",
  ],
};

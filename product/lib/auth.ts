import "server-only";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/db";

/**
 * Cookie-write-capable client for use inside Route Handlers (sign-in,
 * sign-up, sign-out, OAuth callback, password reset) — these need to
 * persist the session Supabase Auth issues. `cookies().set()` only works
 * in Route Handlers/Server Actions, never in Server Components.
 */
export async function getAuthClient() {
  const store = await cookies();
  return getSupabaseServerClient({
    getAll: () => store.getAll(),
    setAll: (list) => {
      for (const { name, value, options } of list) store.set(name, value, options);
    },
  });
}

/**
 * Read-only variant for anywhere that only needs to know who's logged in
 * (every data API route, Server Components) — cookie writes silently no-op
 * here since most of these call sites can't persist refreshed cookies.
 */
export async function getCurrentUser() {
  const store = await cookies();
  const supabase = getSupabaseServerClient({
    getAll: () => store.getAll(),
    setAll: () => { /* no-op: this call site doesn't need to persist a refreshed session */ },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  return error ? null : user;
}

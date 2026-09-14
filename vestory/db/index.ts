import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const AUDIO_BUCKET = "vestory-audio";

const cache = globalThis as typeof globalThis & {
  __vestorySupabase?: SupabaseClient;
};

export function getSupabaseAdmin() {
  if (cache.__vestorySupabase) return cache.__vestorySupabase;

  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
  const secret = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !secret) throw new Error("missing_supabase_configuration");

  const client = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  if (process.env.NODE_ENV !== "production") cache.__vestorySupabase = client;
  return client;
}

export function assertSupabase(error: { message: string } | null, operation: string) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

export function audioObjectPath(briefId: string, storedValue: string) {
  return storedValue.includes("/") ? storedValue : `${briefId}/${storedValue}`;
}

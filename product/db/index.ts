import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const AUDIO_BUCKET = "vestory-audio";

const cache = globalThis as typeof globalThis & {
  __productSupabase?: SupabaseClient;
};

export function getSupabaseAdmin() {
  if (cache.__productSupabase) return cache.__productSupabase;

  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
  const secret = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !secret) throw new Error("missing_supabase_configuration");

  const client = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  if (process.env.NODE_ENV !== "production") cache.__productSupabase = client;
  return client;
}

export function assertSupabase(error: { message: string } | null, operation: string) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

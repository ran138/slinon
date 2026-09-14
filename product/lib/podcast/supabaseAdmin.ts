import "server-only";

export { getSupabaseAdmin, assertSupabase, AUDIO_BUCKET } from "@/db";

export function audioObjectPath(briefId: string, storedValue: string) {
  return storedValue.includes("/") ? storedValue : `${briefId}/${storedValue}`;
}

import "server-only";
import crypto from "node:crypto";
import { getSupabaseAdmin, assertSupabase } from "./supabaseAdmin";
import type { ProfileInput } from "./types";

export interface CacheKeyInput {
  profile: ProfileInput;
  windowStart: string;
  windowEnd: string;
  itemIds: string[];
}

/**
 * Includes the fetched items' ids, not just topics/duration/window: if the
 * data source later adds more items for the same window, the id set
 * changes and this naturally misses instead of silently serving a
 * stale/incomplete cached episode.
 */
export function computeCacheKey(input: CacheKeyInput): string {
  const topics = [
    ...input.profile.holdings.map((h) => `holding:${h.symbol.toUpperCase()}`),
    ...input.profile.watchlist.map((w) => `watchlist:${w.symbol.toUpperCase()}`),
    ...input.profile.interests.map((i) => `interest:${i.label.toLowerCase()}`),
  ].sort();
  const canonical = JSON.stringify({
    topics,
    targetMinutes: input.profile.targetMinutes,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    itemIds: [...input.itemIds].sort(),
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export async function getCachedBriefId(hash: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().from("podcast_cache").select("brief_id").eq("hash", hash).maybeSingle();
  assertSupabase(error, "read podcast cache");
  return (data?.brief_id as string | undefined) ?? null;
}

export async function setCachedBriefId(hash: string, briefId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("podcast_cache").upsert({ hash, brief_id: briefId, created_at: new Date().toISOString() });
  assertSupabase(error, "write podcast cache");
}

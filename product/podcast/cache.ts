import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import type { ProfileInput } from "./types";

// Deliberately a separate, self-contained SQLite file — not the existing
// data/haskahon.sqlite — so this stays fully independent of the existing
// database and its schema file (nothing here edits db/schema.ts or db/index.ts).
const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const globalCache = globalThis as typeof globalThis & { __podcastCacheDb?: Database.Database };
const sqlite = globalCache.__podcastCacheDb ?? new Database(path.join(dataDir, "podcast-cache.sqlite"));
if (process.env.NODE_ENV !== "production") globalCache.__podcastCacheDb = sqlite;

sqlite.pragma("journal_mode = WAL");
sqlite.exec(
  "CREATE TABLE IF NOT EXISTS cache_entries (hash TEXT PRIMARY KEY, brief_id TEXT NOT NULL, created_at TEXT NOT NULL);",
);

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

export function getCachedBriefId(hash: string): string | null {
  const row = sqlite.prepare("SELECT brief_id FROM cache_entries WHERE hash = ?").get(hash) as
    | { brief_id: string }
    | undefined;
  return row?.brief_id ?? null;
}

export function setCachedBriefId(hash: string, briefId: string): void {
  sqlite
    .prepare("INSERT OR REPLACE INTO cache_entries (hash, brief_id, created_at) VALUES (?, ?, ?)")
    .run(hash, briefId, new Date().toISOString());
}

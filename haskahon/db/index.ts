import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(path.join(dataDir, "audio"), { recursive: true });
const cache = globalThis as typeof globalThis & { __haskahonSqlite?: Database.Database };
const sqlite = cache.__haskahonSqlite ?? new Database(path.join(dataDir, "haskahon.sqlite"));
if (process.env.NODE_ENV !== "production") cache.__haskahonSqlite = sqlite;
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");
sqlite.exec(`
CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY DEFAULT 1, language TEXT NOT NULL DEFAULT 'he', target_minutes INTEGER NOT NULL DEFAULT 7, onboarding_complete INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS onboarding_draft (id INTEGER PRIMARY KEY CHECK (id = 1), portfolio_text TEXT NOT NULL DEFAULT '', assets_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, symbol TEXT NOT NULL, asset_class TEXT, exchange TEXT, quantity TEXT, average_cost TEXT, currency TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_assets_kind ON assets(kind);
CREATE TABLE IF NOT EXISTS interests (id TEXT PRIMARY KEY, label TEXT NOT NULL UNIQUE, custom INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS briefs (id TEXT PRIMARY KEY, status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, stage_label TEXT NOT NULL, title TEXT, profile_snapshot TEXT NOT NULL, research_dossier TEXT, target_minutes INTEGER NOT NULL, duration_ms INTEGER, error_code TEXT, error_message TEXT, retry_of TEXT, created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT);
CREATE INDEX IF NOT EXISTS idx_briefs_status_created ON briefs(status, created_at);
CREATE TABLE IF NOT EXISTS chapters (id TEXT PRIMARY KEY, brief_id TEXT NOT NULL REFERENCES briefs(id) ON DELETE CASCADE, position INTEGER NOT NULL, title TEXT NOT NULL, script TEXT NOT NULL, reason_kind TEXT NOT NULL, reason_label TEXT NOT NULL, audio_file TEXT, duration_ms INTEGER, start_ms INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_chapters_brief_position ON chapters(brief_id, position);
CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, brief_id TEXT NOT NULL REFERENCES briefs(id) ON DELETE CASCADE, chapter_id TEXT REFERENCES chapters(id) ON DELETE CASCADE, title TEXT NOT NULL, publisher TEXT, url TEXT NOT NULL, published_at TEXT, accessed_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sources_brief ON sources(brief_id);
`);
sqlite.prepare("INSERT OR IGNORE INTO settings (id, updated_at) VALUES (1, ?)").run(new Date().toISOString());

export const db = drizzle(sqlite, { schema });
export const rawDb = sqlite;
export const audioRoot = path.join(dataDir, "audio");

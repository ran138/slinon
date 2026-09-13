import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey().default(1),
  language: text("language").notNull().default("he"),
  targetMinutes: integer("target_minutes").notNull().default(7),
  onboardingComplete: integer("onboarding_complete", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull(),
});

export const assets = sqliteTable("assets", {
  id: text("id").primaryKey(), kind: text("kind", { enum: ["holding", "watchlist"] }).notNull(),
  name: text("name").notNull(), symbol: text("symbol").notNull(), assetClass: text("asset_class"),
  exchange: text("exchange"), quantity: text("quantity"), averageCost: text("average_cost"),
  currency: text("currency"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (t) => [index("idx_assets_kind").on(t.kind)]);

export const interests = sqliteTable("interests", {
  id: text("id").primaryKey(), label: text("label").notNull().unique(),
  custom: integer("custom", { mode: "boolean" }).notNull().default(false), createdAt: text("created_at").notNull(),
});

export const briefs = sqliteTable("briefs", {
  id: text("id").primaryKey(),
  status: text("status", { enum: ["queued", "researching", "scripting", "synthesizing", "completed", "failed"] }).notNull(),
  progress: integer("progress").notNull().default(0), stageLabel: text("stage_label").notNull(),
  title: text("title"), profileSnapshot: text("profile_snapshot").notNull(), researchDossier: text("research_dossier"),
  targetMinutes: integer("target_minutes").notNull(), durationMs: integer("duration_ms"),
  errorCode: text("error_code"), errorMessage: text("error_message"), retryOf: text("retry_of"),
  createdAt: text("created_at").notNull(), startedAt: text("started_at"), completedAt: text("completed_at"),
}, (t) => [index("idx_briefs_status_created").on(t.status, t.createdAt)]);

export const chapters = sqliteTable("chapters", {
  id: text("id").primaryKey(), briefId: text("brief_id").notNull().references(() => briefs.id, { onDelete: "cascade" }),
  position: integer("position").notNull(), title: text("title").notNull(), script: text("script").notNull(),
  reasonKind: text("reason_kind", { enum: ["portfolio", "watchlist", "interest", "general"] }).notNull(),
  reasonLabel: text("reason_label").notNull(), audioFile: text("audio_file"), durationMs: integer("duration_ms"),
  startMs: integer("start_ms").notNull().default(0),
}, (t) => [index("idx_chapters_brief_position").on(t.briefId, t.position)]);

export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(), briefId: text("brief_id").notNull().references(() => briefs.id, { onDelete: "cascade" }),
  chapterId: text("chapter_id").references(() => chapters.id, { onDelete: "cascade" }), title: text("title").notNull(),
  publisher: text("publisher"), url: text("url").notNull(), publishedAt: text("published_at"), accessedAt: text("accessed_at").notNull(),
}, (t) => [index("idx_sources_brief").on(t.briefId)]);

export type Asset = typeof assets.$inferSelect;
export type Interest = typeof interests.$inferSelect;
export type Brief = typeof briefs.$inferSelect;
export type Chapter = typeof chapters.$inferSelect;
export type Source = typeof sources.$inferSelect;

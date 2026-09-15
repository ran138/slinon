import { z } from "zod";

export const assetInputSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["holding", "watchlist"]),
  name: z.string().trim().min(1).max(100),
  symbol: z.string().trim().min(1).max(20).transform((v) => v.toUpperCase()),
  assetClass: z.string().trim().max(40).nullable().optional(),
  exchange: z.string().trim().max(40).nullable().optional(),
  quantity: z.string().trim().max(30).nullable().optional(),
  averageCost: z.string().trim().max(30).nullable().optional(),
  currency: z.string().trim().max(10).nullable().optional(),
});

export const profileUpdateSchema = z.object({
  targetMinutes: z.union([z.literal(5), z.literal(7), z.literal(10)]),
  podcastPlan: z.enum(["daily", "weekly"]),
  scheduleTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  scheduleDay: z.number().int().min(1).max(5).nullable(),
  scheduleTimezone: z.literal("Asia/Jerusalem"),
  notifyByEmail: z.boolean(),
  onboardingComplete: z.boolean(),
  assets: z.array(assetInputSchema).max(50),
  interests: z.array(z.object({ label: z.string().trim().min(1).max(80), custom: z.boolean().optional() })).min(1).max(30),
}).superRefine((value, context) => {
  if (value.podcastPlan === "weekly" && value.scheduleDay === null) {
    context.addIssue({ code: "custom", path: ["scheduleDay"], message: "Weekly plans require a day" });
  }
});

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export type BriefView = {
  id: string;
  audioUrl: string | null;
  status: "queued" | "researching" | "scripting" | "synthesizing" | "completed" | "failed";
  progress: number;
  stageLabel: string;
  title: string | null;
  targetMinutes: number;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  chapters: Array<{
    id: string; position: number; title: string; script: string; reasonKind: string;
    reasonLabel: string; durationMs: number | null; startMs: number; audioUrl: string | null;
  }>;
  sources: Array<{ id: string; chapterId: string | null; title: string; publisher: string | null; url: string }>;
};

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectedItem } from "../product/lib/podcast/types";

const mocks = vi.hoisted(() => ({
  speechCreate: vi.fn(),
  parseBuffer: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  assertSupabase: vi.fn((error: { message: string } | null, operation: string) => {
    if (error) throw new Error(`${operation}: ${error.message}`);
  }),
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    audio = { speech: { create: mocks.speechCreate } };
  },
}));

vi.mock("music-metadata", () => ({ parseBuffer: mocks.parseBuffer }));
vi.mock("../product/lib/podcast/supabaseAdmin", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
  assertSupabase: mocks.assertSupabase,
  AUDIO_BUCKET: "vestory-audio",
}));

import { synthesizePodcastAudio } from "../product/lib/podcast/synthesize";

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  mocks.speechCreate.mockImplementation(async ({ input }: { input: string }) => ({
    arrayBuffer: async () => new TextEncoder().encode(input).buffer,
  }));
  mocks.parseBuffer
    .mockResolvedValueOnce({ format: { duration: 2.5 } })
    .mockResolvedValueOnce({ format: { duration: 1.25 } });
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_TTS_MODEL;
  delete process.env.OPENAI_TTS_VOICE;
});

describe("podcast speech synthesis", () => {
  it("requires an API key before spending or writing", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(synthesizePodcastAudio("brief-1", [], new Map())).rejects.toThrow("missing_api_key");
    expect(mocks.speechCreate).not.toHaveBeenCalled();
  });

  it("synthesizes chapters, records ordered offsets, uploads the full episode and saves sources", async () => {
    const uploads: Array<{ path: string; bytes: Buffer }> = [];
    const chapterUpdates: Array<Record<string, unknown>> = [];
    const sourceInserts: unknown[] = [];
    const upload = vi.fn(async (path: string, bytes: Buffer) => {
      uploads.push({ path, bytes });
      return { error: null };
    });
    const from = vi.fn((table: string) => {
      if (table === "chapters") return {
        update: vi.fn((values: Record<string, unknown>) => ({
          eq: vi.fn(async () => { chapterUpdates.push(values); return { error: null }; }),
        })),
      };
      if (table === "sources") return {
        insert: vi.fn(async (values: unknown) => { sourceInserts.push(values); return { error: null }; }),
      };
      throw new Error(`unexpected table ${table}`);
    });
    mocks.getSupabaseAdmin.mockReturnValue({
      storage: { from: vi.fn(() => ({ upload })) },
      from,
    });

    const items = new Map<string, CollectedItem>([
      ["one", {
        id: "one", topicKind: "holding", topicLabel: "NVDA", relatedSymbols: ["NVDA"],
        occurredAt: "2026-09-16T10:00:00Z", headline: "Story one", summary: "Summary", numericFacts: [],
        sourceUrl: "https://example.com/one", sourceName: "Example",
      }],
      ["without-url", {
        id: "without-url", topicKind: "interest", topicLabel: "שבבים", relatedSymbols: [],
        occurredAt: "2026-09-16T10:00:00Z", headline: "No link", summary: "Summary", numericFacts: [],
      }],
    ]);
    const result = await synthesizePodcastAudio("brief-1", [
      { id: "chapter-a", position: 1, script: "פרק שני", sourceItemIds: ["without-url"] },
      { id: "chapter-b", position: 0, script: "פרק ראשון", sourceItemIds: ["one"] },
    ], items);

    expect(mocks.speechCreate).toHaveBeenCalledTimes(2);
    expect(mocks.speechCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-4o-mini-tts", voice: "ash", response_format: "mp3",
    }));
    expect(result).toEqual({ totalDurationMs: 3750 });
    expect(chapterUpdates).toEqual([
      expect.objectContaining({ audio_file: "brief-1/0-chapter-b.mp3", duration_ms: 1250, start_ms: 0 }),
      expect.objectContaining({ audio_file: "brief-1/1-chapter-a.mp3", duration_ms: 2500, start_ms: 1250 }),
    ]);
    expect(uploads.map((entry) => entry.path)).toEqual(expect.arrayContaining([
      "brief-1/0-chapter-b.mp3", "brief-1/1-chapter-a.mp3", "brief-1/podcast.mp3",
    ]));
    expect(sourceInserts).toHaveLength(1);
    expect(sourceInserts[0]).toEqual([expect.objectContaining({
      brief_id: "brief-1", chapter_id: "chapter-b", title: "Story one", url: "https://example.com/one",
    })]);
  });

  it("falls back to a speech-rate duration when MP3 metadata has no duration", async () => {
    mocks.parseBuffer.mockReset().mockResolvedValue({ format: {} });
    const updates: Array<Record<string, unknown>> = [];
    mocks.getSupabaseAdmin.mockReturnValue({
      storage: { from: vi.fn(() => ({ upload: vi.fn().mockResolvedValue({ error: null }) })) },
      from: vi.fn((table: string) => table === "chapters" ? {
        update: vi.fn((values: Record<string, unknown>) => ({
          eq: vi.fn(async () => { updates.push(values); return { error: null }; }),
        })),
      } : { insert: vi.fn().mockResolvedValue({ error: null }) }),
    });
    const words = Array.from({ length: 145 }, () => "מילה").join(" ");
    const result = await synthesizePodcastAudio("brief-1", [
      { id: "chapter-1", position: 0, script: words, sourceItemIds: [] },
    ], new Map());
    expect(result.totalDurationMs).toBe(60_000);
    expect(updates[0]).toMatchObject({ duration_ms: 60_000, start_ms: 0 });
  });
});

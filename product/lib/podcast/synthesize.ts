import "server-only";
import OpenAI from "openai";
import { parseBuffer } from "music-metadata";
import { getSupabaseAdmin, assertSupabase, AUDIO_BUCKET } from "./supabaseAdmin";
import type { CollectedItem } from "./types";
import { WORDS_PER_MINUTE } from "./constants";

export interface ChapterRecord {
  id: string;
  position: number;
  script: string;
  sourceItemIds: string[];
}

export interface SynthesizeResult {
  totalDurationMs: number;
}

async function uploadAudio(path: string, bytes: Buffer) {
  const { error } = await getSupabaseAdmin().storage.from(AUDIO_BUCKET).upload(path, bytes, {
    contentType: "audio/mpeg",
    upsert: true,
  });
  assertSupabase(error, "upload audio");
}

/**
 * Takes a brief's already-persisted chapter rows (inserted by orchestrator.ts)
 * and, per chapter: calls OpenAI's TTS API for an mp3, uploads it to the
 * `vestory-audio` Supabase Storage bucket, records audio_file/duration_ms/
 * start_ms on the existing `chapters` table, and inserts `sources` rows
 * linked to the real chapterId. Concatenates a full podcast.mp3 at the end
 * and returns the total duration.
 *
 * This is the one function that spends TTS money — the caller (orchestrator)
 * is expected to have already gone through the cache check in cache.ts
 * before ever reaching here.
 */
export async function synthesizePodcastAudio(
  briefId: string,
  chapters: ChapterRecord[],
  itemsById: Map<string, CollectedItem>,
): Promise<SynthesizeResult> {
  if (!process.env.OPENAI_API_KEY) throw new Error("missing_api_key");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 90_000, maxRetries: 2 });
  const supabase = getSupabaseAdmin();

  // Each chapter's TTS call + upload + duration probe is independent of the
  // others, so run them concurrently — this was previously a sequential
  // for-loop and was the single biggest contributor to total generation
  // wall-clock time. Only the start_ms offsets (which depend on every
  // earlier chapter's real duration) and the DB writes stay sequential,
  // applied afterward in position order.
  const synthesized = await Promise.all(
    chapters.map(async (chapter) => {
      const speech = await client.audio.speech.create({
        model: process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts",
        voice: (process.env.OPENAI_TTS_VOICE ?? "ash") as "ash",
        input: chapter.script,
        response_format: "mp3",
        instructions: "דברו בעברית ישראלית טבעית, רגועה וברורה, כמו מגיש חדשות פיננסיות אחראי.",
      });
      const bytes = Buffer.from(await speech.arrayBuffer());

      const objectPath = `${briefId}/${chapter.position}-${chapter.id}.mp3`;
      await uploadAudio(objectPath, bytes);

      const metadata = await parseBuffer(bytes, { mimeType: "audio/mpeg", size: bytes.length });
      const duration = Math.max(
        1000,
        Math.round((metadata.format.duration ?? (chapter.script.split(/\s+/).length / WORDS_PER_MINUTE) * 60) * 1000),
      );
      return { chapter, bytes, objectPath, duration };
    }),
  );
  synthesized.sort((a, b) => a.chapter.position - b.chapter.position);

  let total = 0;
  const audioParts: Buffer[] = [];
  const sourceRows: Array<{
    id: string; brief_id: string; chapter_id: string; title: string;
    publisher: string | null; url: string; accessed_at: string;
  }> = [];

  for (const { chapter, bytes, objectPath, duration } of synthesized) {
    audioParts.push(bytes);

    const saved = await supabase
      .from("chapters")
      .update({ audio_file: objectPath, duration_ms: duration, start_ms: total })
      .eq("id", chapter.id);
    assertSupabase(saved.error, "save chapter audio metadata");
    total += duration;

    for (const itemId of chapter.sourceItemIds) {
      const item = itemsById.get(itemId);
      if (!item || !item.sourceUrl) continue;
      sourceRows.push({
        id: crypto.randomUUID(),
        brief_id: briefId,
        chapter_id: chapter.id,
        title: item.headline,
        publisher: item.sourceName ?? null,
        url: item.sourceUrl,
        accessed_at: new Date().toISOString(),
      });
    }
  }

  await uploadAudio(`${briefId}/podcast.mp3`, Buffer.concat(audioParts));

  if (sourceRows.length) {
    const inserted = await supabase.from("sources").insert(sourceRows);
    assertSupabase(inserted.error, "save sources");
  }

  return { totalDurationMs: total };
}

import "server-only";
import path from "node:path";
import fs from "node:fs/promises";
import OpenAI from "openai";
import { parseBuffer } from "music-metadata";
import { audioRoot, rawDb } from "@/db";
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

/**
 * Takes a brief's already-persisted chapter rows (inserted by orchestrator.ts)
 * and, per chapter: calls OpenAI's TTS API for an mp3, writes it to disk
 * under audioRoot/<briefId>/, records audio_file/duration_ms/start_ms on the
 * existing `chapters` table, and links `sources` rows with the real
 * chapterId (the current pipeline always leaves that NULL — this fixes it).
 * Concatenates a full podcast.mp3 at the end and returns the total duration.
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

  const dir = path.join(audioRoot, briefId);
  await fs.mkdir(dir, { recursive: true });

  const insertSource = rawDb.prepare(
    "INSERT INTO sources (id,brief_id,chapter_id,title,publisher,url,accessed_at) VALUES (?,?,?,?,?,?,?)",
  );

  let total = 0;
  const audioParts: Buffer[] = [];

  for (const chapter of chapters) {
    const speech = await client.audio.speech.create({
      model: process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts",
      voice: (process.env.OPENAI_TTS_VOICE ?? "coral") as "coral",
      input: chapter.script,
      response_format: "mp3",
      instructions: "דברו בעברית ישראלית טבעית, רגועה וברורה, כמו מגיש חדשות פיננסיות אחראי.",
    });
    const bytes = Buffer.from(await speech.arrayBuffer());
    audioParts.push(bytes);

    const filename = `${chapter.position}-${chapter.id}.mp3`;
    const temp = path.join(dir, `${filename}.tmp`);
    await fs.writeFile(temp, bytes);
    await fs.rename(temp, path.join(dir, filename));

    const metadata = await parseBuffer(bytes, { mimeType: "audio/mpeg", size: bytes.length });
    const duration = Math.max(
      1000,
      Math.round((metadata.format.duration ?? (chapter.script.split(/\s+/).length / WORDS_PER_MINUTE) * 60) * 1000),
    );
    rawDb
      .prepare("UPDATE chapters SET audio_file = ?, duration_ms = ?, start_ms = ? WHERE id = ?")
      .run(filename, duration, total, chapter.id);
    total += duration;

    for (const itemId of chapter.sourceItemIds) {
      const item = itemsById.get(itemId);
      if (!item || !item.sourceUrl) continue;
      insertSource.run(
        crypto.randomUUID(),
        briefId,
        chapter.id,
        item.headline,
        item.sourceName ?? null,
        item.sourceUrl,
        new Date().toISOString(),
      );
    }
  }

  await fs.writeFile(path.join(dir, "podcast.mp3"), Buffer.concat(audioParts));
  return { totalDurationMs: total };
}

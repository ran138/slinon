import { createHash } from "node:crypto";
import { decode, encode } from "gpt-tokenizer/encoding/cl100k_base";

export interface ContentChunk {
  index: number;
  content: string;
  contentHash: string;
  tokenCount: number;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeContent(content: string): string {
  return content.replace(/\r\n?/g, "\n").replace(/[\t ]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function chunkContent(
  content: string,
  options: { maxTokens?: number; overlapTokens?: number } = {},
): ContentChunk[] {
  const normalized = normalizeContent(content);
  if (!normalized) return [];
  const maxTokens = Math.max(50, Math.trunc(options.maxTokens ?? 700));
  const overlapTokens = Math.max(0, Math.min(maxTokens - 1, Math.trunc(options.overlapTokens ?? 100)));
  const tokens = encode(normalized);
  const chunks: ContentChunk[] = [];
  const step = maxTokens - overlapTokens;
  for (let start = 0; start < tokens.length; start += step) {
    const slice = tokens.slice(start, Math.min(tokens.length, start + maxTokens));
    const chunk = decode(slice).trim();
    if (!chunk) continue;
    chunks.push({
      index: chunks.length,
      content: chunk,
      contentHash: sha256(chunk),
      tokenCount: slice.length,
    });
    if (start + maxTokens >= tokens.length) break;
  }
  const unique = [...new Map(chunks.map((chunk) => [chunk.contentHash, chunk])).values()];
  return unique.map((chunk, index) => ({ ...chunk, index }));
}

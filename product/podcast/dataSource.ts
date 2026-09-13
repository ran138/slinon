import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type { CollectedItem, TopicKind } from "./types";

const FIXTURES_PATH = path.join(process.cwd(), "product", "podcast", "fixtures", "sample-items.json");

export interface TopicQuery {
  kind: TopicKind;
  label: string;
}

/**
 * TODO: replace with the real data-collection service/table once it exists
 * (owned by a teammate, shape not decided yet). Nothing else in this
 * pipeline depends on how items are actually stored — only on this
 * function's input/output shape, so swapping the implementation here is
 * the only change needed once that's ready.
 *
 * Until then, reads from ./fixtures/sample-items.json so the rest of the
 * pipeline is buildable and testable today.
 */
export async function fetchCollectedItems(
  topics: TopicQuery[],
  windowStart: string,
  windowEnd: string,
): Promise<CollectedItem[]> {
  const raw = await fs.readFile(FIXTURES_PATH, "utf-8");
  const all = JSON.parse(raw) as CollectedItem[];

  const wanted = new Set(topics.map((t) => `${t.kind}:${t.label.toLowerCase()}`));
  const start = new Date(windowStart).getTime();
  const end = new Date(windowEnd).getTime();

  return all.filter((item) => {
    const key = `${item.topicKind}:${item.topicLabel.toLowerCase()}`;
    if (!wanted.has(key)) return false;
    const occurred = new Date(item.occurredAt).getTime();
    return occurred >= start && occurred <= end;
  });
}

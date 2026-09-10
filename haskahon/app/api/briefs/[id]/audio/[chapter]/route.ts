import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { audioRoot, rawDb } from "@/db";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; chapter: string }> }) {
  const { id, chapter } = await params;
  const row = chapter === "full"
    ? rawDb.prepare("SELECT CASE WHEN status='completed' THEN 'podcast.mp3' END AS audio_file FROM briefs WHERE id=?").get(id) as { audio_file: string | null } | undefined
    : rawDb.prepare("SELECT audio_file FROM chapters WHERE id=? AND brief_id=?").get(chapter, id) as { audio_file: string | null } | undefined;
  if (!row?.audio_file) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const file = path.resolve(audioRoot, id, row.audio_file);
  const root = path.resolve(audioRoot) + path.sep;
  if (!file.startsWith(root) || !fs.existsSync(file)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const size = fs.statSync(file).size; const range = request.headers.get("range");
  if (!range) return new Response(fs.readFileSync(file), { headers: { "Content-Type": "audio/mpeg", "Content-Length": String(size), "Accept-Ranges": "bytes" } });
  const match = /^bytes=(\d+)-(\d*)$/.exec(range);
  if (!match) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  const start = Number(match[1]); const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  const body = fs.readFileSync(file).subarray(start, end + 1);
  return new Response(body, { status: 206, headers: { "Content-Type": "audio/mpeg", "Content-Length": String(body.length), "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes" } });
}

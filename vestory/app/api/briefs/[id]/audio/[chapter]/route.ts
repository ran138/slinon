import { NextResponse } from "next/server";
import { AUDIO_BUCKET, assertSupabase, audioObjectPath, getSupabaseAdmin } from "@/db";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; chapter: string }> }) {
  const { id, chapter } = await params;
  const supabase = getSupabaseAdmin();
  let storedValue: string | null = null;

  if (chapter === "full") {
    const { data, error } = await supabase.from("briefs").select("status").eq("id", id).maybeSingle();
    assertSupabase(error, "load brief audio");
    if (data?.status === "completed") storedValue = `${id}/podcast.mp3`;
  } else {
    const { data, error } = await supabase.from("chapters").select("audio_file")
      .eq("id", chapter).eq("brief_id", id).maybeSingle();
    assertSupabase(error, "load chapter audio");
    storedValue = data?.audio_file ?? null;
  }

  if (!storedValue) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data: audio, error } = await supabase.storage.from(AUDIO_BUCKET).download(audioObjectPath(id, storedValue));
  if (error || !audio) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const bytes = Buffer.from(await audio.arrayBuffer());
  const size = bytes.length;
  const range = request.headers.get("range");
  if (!range) return new Response(bytes, { headers: {
    "Content-Type": "audio/mpeg", "Content-Length": String(size), "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600",
  } });

  const match = /^bytes=(\d+)-(\d*)$/.exec(range);
  if (!match) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  const body = bytes.subarray(start, end + 1);
  return new Response(body, { status: 206, headers: {
    "Content-Type": "audio/mpeg", "Content-Length": String(body.length),
    "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes",
  } });
}

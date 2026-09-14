import { NextResponse } from "next/server";
import { getSupabaseAdmin, assertSupabase, AUDIO_BUCKET } from "@/db";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string; chapter: string }> }) {
  const { id, chapter } = await params;
  const supabase = getSupabaseAdmin();

  let objectPath: string;
  if (chapter === "full") {
    objectPath = `${id}/podcast.mp3`;
  } else {
    const { data, error } = await supabase.from("chapters").select("audio_file").eq("id", chapter).eq("brief_id", id).maybeSingle();
    assertSupabase(error, "load chapter audio path");
    if (!data?.audio_file) return NextResponse.json({ error: "not_found" }, { status: 404 });
    objectPath = data.audio_file as string;
  }

  const { data: blob, error: downloadError } = await supabase.storage.from(AUDIO_BUCKET).download(objectPath);
  if (downloadError || !blob) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return new NextResponse(await blob.arrayBuffer(), {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" },
  });
}

import { NextResponse } from "next/server";
import { AUDIO_BUCKET, assertSupabase, audioObjectPath, getSupabaseAdmin } from "@/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; chapter: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, chapter } = await params;
  const supabase = getSupabaseAdmin();

  const owned = await supabase.from("briefs").select("status").eq("id", id).eq("user_id", user.id).maybeSingle();
  assertSupabase(owned.error, "load brief audio");
  if (!owned.data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let storedValue: string | null = null;
  if (chapter === "full") {
    if (owned.data.status === "completed") storedValue = `${id}/podcast.mp3`;
  } else {
    const { data, error } = await supabase.from("chapters").select("audio_file")
      .eq("id", chapter).eq("brief_id", id).maybeSingle();
    assertSupabase(error, "load chapter audio");
    storedValue = data?.audio_file ?? null;
  }

  if (!storedValue) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Redirect to a short-lived signed URL instead of downloading the whole
  // file into memory here and slicing it ourselves — that previously meant
  // every single Range request (including the browser's small initial
  // probe) paid the cost of pulling the entire multi-MB episode out of
  // Storage before responding with even the first byte, which is most of
  // where the ~1.5s play-button delay was coming from. Supabase Storage's
  // own CDN serves Range requests natively and far faster.
  const { data: signed, error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(audioObjectPath(id, storedValue), 60 * 30);
  if (error || !signed?.signedUrl) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.redirect(signed.signedUrl, { status: 302 });
}

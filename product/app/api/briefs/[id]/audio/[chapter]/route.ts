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

  // Two earlier approaches were both slower in practice than this one:
  // (1) download() pulled the ENTIRE file into memory on every request
  //     (including the browser's small initial Range probe) before slicing
  //     it ourselves — wasteful, but at least the browser only ever talked
  //     to our own already-warm origin connection.
  // (2) redirecting the browser to a signed URL avoided that, but made the
  //     browser open a brand-new connection (fresh DNS + TLS handshake) to
  //     a host it had never talked to — worse when playback starts right
  //     after a screen navigation (dashboard "play" autoplay), since there
  //     was zero warm-up time for that new connection.
  // This forwards the incoming Range header to Storage server-side and
  // streams the (already range-limited) response straight back over the
  // client's existing connection to us — only the requested bytes are
  // transferred, and the browser never has to talk to a new host.
  const { data: signed, error: signError } = await supabase.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(audioObjectPath(id, storedValue), 60 * 30);
  if (signError || !signed?.signedUrl) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const range = request.headers.get("range");
  const upstream = await fetch(signed.signedUrl, range ? { headers: { Range: range } } : undefined);
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
    "Accept-Ranges": "bytes",
  });
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  if (!range) headers.set("Cache-Control", "private, max-age=3600");

  return new Response(upstream.body, { status: upstream.status, headers });
}

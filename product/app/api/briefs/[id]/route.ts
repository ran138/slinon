import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getBrief } from "@/lib/briefs";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const brief = await getBrief(id, user.id);
  return brief ? NextResponse.json(brief) : NextResponse.json({ error: "not_found" }, { status: 404 });
}

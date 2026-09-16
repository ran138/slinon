import type { BriefView } from "@/lib/domain";

export function podcastDisplayTitle(brief: Pick<BriefView, "title" | "chapters"> | null) {
  const editorial = brief?.title?.trim();
  const meaningful = editorial && !/^הפודקאסט של (היום|\d)/.test(editorial);
  const topics = Array.from(new Set(brief?.chapters.map((chapter) => chapter.title.trim()).filter(Boolean) ?? [])).slice(0, 3);
  const title = meaningful ? editorial : topics.length ? topics.join(" · ") : "עדכון השוק שלך";
  return title.length > 110 ? `${title.slice(0, 107).replace(/\s+\S*$/, "")}…` : title;
}

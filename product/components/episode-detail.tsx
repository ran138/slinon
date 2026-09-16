"use client";

import type { ReactNode } from "react";
import { ArrowRight, BookOpen, SkipBack, SkipForward } from "lucide-react";
import type { BriefView } from "@/lib/domain";
import { AppSidebar, type AppDestination } from "@/components/app-sidebar";
import { podcastDisplayTitle } from "@/lib/podcast/display";

const time = (ms: number) => `${Math.floor(ms / 60000)}:${Math.floor(ms / 1000 % 60).toString().padStart(2,"0")}`;
export function EpisodeDetail({brief, children, onNav, onPreferences, onSignOut, email, plan, activeChapter, onChapter, onSources, speed, onSpeed}: {
  brief: BriefView; children: ReactNode; onNav: (screen: AppDestination) => void; onPreferences: () => void; onSignOut: () => void;
  email: string | null; plan: "daily" | "weekly"; activeChapter: number; onChapter: (index: number) => void; onSources: () => void;
  speed: number; onSpeed: (value: number) => void;
}) {
  const tags = [...new Set(brief.chapters.filter(c=>c.reasonKind!=="general").map(c=>c.reasonLabel).filter(Boolean))].slice(0,3);
  return <div className="today-shell episode-shell" dir="ltr">
    <AppSidebar active="history" onNav={onNav} onPreferences={onPreferences} onSignOut={onSignOut} email={email} plan={plan}/>
    <main className="today-content episode-content" dir="rtl">
      <button className="episode-back" onClick={()=>onNav("history")}><ArrowRight size={16}/>חזרה להיסטוריה</button>
      <header className="episode-header"><div><span className="episode-eyebrow">הפודקאסט שלך</span><h1><bdi dir="auto">{podcastDisplayTitle(brief)}</bdi></h1><div className="history-tags">{tags.map(t=><span key={t}><bdi dir="auto">{t}</bdi></span>)}</div></div></header>
      <div className="episode-grid"><section className="episode-listening" aria-label="נגן הפודקאסט">{children}
        <div className="episode-controls"><div className="episode-chapter-controls" dir="ltr"><button aria-label="הפרק הקודם" disabled={activeChapter===0 || !brief.audioUrl} onClick={()=>onChapter(activeChapter-1)}><SkipBack size={19}/></button><button aria-label="הפרק הבא" disabled={activeChapter>=brief.chapters.length-1 || !brief.audioUrl} onClick={()=>onChapter(activeChapter+1)}><SkipForward size={19}/></button></div><label>מהירות<select aria-label="מהירות ניגון" value={speed} onChange={e=>onSpeed(Number(e.target.value))}>{[.5,1,1.25,1.5,2].map(v=><option key={v} value={v}>{v}×</option>)}</select></label><button onClick={onSources}><BookOpen size={17}/>מקורות</button></div>
        {brief.chapters[activeChapter]?.script && <section className="episode-transcript"><h3>תוכן הפרק</h3><p>{brief.chapters[activeChapter].script}</p></section>}
      </section><aside className="today-card episode-chapters" aria-label="פרקים"><h2>פרקים <span>{brief.chapters.length}</span></h2>{brief.chapters.map((c,i)=><button key={c.id} aria-current={activeChapter===i?"true":undefined} className={activeChapter===i?"active":""} disabled={!brief.audioUrl} onClick={()=>onChapter(i)}><span className="episode-chapter-number">{i+1}</span><span className="episode-chapter-copy"><bdi dir="auto">{c.title}</bdi><time dir="ltr">{time(c.startMs??0)}</time></span></button>)}</aside></div>
    </main>
  </div>;
}

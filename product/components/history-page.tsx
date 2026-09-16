"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownUp, CalendarDays, Clock3, Heart, MoreVertical, Play, Share2, X } from "lucide-react";
import type { BriefView } from "@/lib/domain";
import { AppSidebar } from "@/components/app-sidebar";
import type { AppDestination } from "@/components/app-sidebar";
import { podcastDisplayTitle } from "@/lib/podcast/display";

const seconds = (ms: number) => `${Math.floor(ms / 60000)}:${Math.floor(ms / 1000 % 60).toString().padStart(2, "0")}`;
const topicTags = (brief: BriefView) => [...new Set(brief.chapters.filter((c) => c.reasonKind !== "general").map((c) => c.reasonLabel.trim()).filter(Boolean))];

export function HistoryPage({ briefs, onOpen, onPlay, onNav, onPreferences, onSignOut, email, plan }: {
  briefs: BriefView[]; onOpen: (id: string) => void; onPlay: (id: string) => void;
  onNav: (screen: AppDestination) => void; onPreferences: () => void; onSignOut: () => void;
  email: string | null; plan: "daily" | "weekly";
}) {
  const [topic, setTopic] = useState("");
  const [year, setYear] = useState("");
  const [order, setOrder] = useState("newest");
  // The existing API has no favorite contract; keep this state scoped to this view.
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    function close(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenu(null);
    }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") setMenu(null); }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [menu]);
  const topics = [...new Set(briefs.flatMap(topicTags))];
  const years = [...new Set(briefs.map((b) => new Date(b.createdAt).getFullYear()).filter(Number.isFinite))].sort((a, b) => b - a);
  const episodes = briefs.filter((b) => (!topic || topicTags(b).includes(topic)) && (!year || String(new Date(b.createdAt).getFullYear()) === year) && (!favoritesOnly || favorites.includes(b.id)))
    .sort((a, b) => (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) * (order === "newest" ? 1 : -1));
  function toggleFavorite(id: string) {
    setFavorites((values) => values.includes(id) ? values.filter((v) => v !== id) : [...values, id]);
  }
  async function share(brief: BriefView) {
    const url = `${window.location.origin}/vestory_app?brief=${encodeURIComponent(brief.id)}`;
    try {
      if (navigator.share) await navigator.share({title: podcastDisplayTitle(brief), url});
      else { await navigator.clipboard.writeText(url); setNotice("הקישור הועתק. הפודקאסט האישי זמין רק בחשבון שבו נוצר."); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setNotice("לא הצלחנו לשתף את הקישור.");
    }
    setMenu(null);
  }
  return <div className="today-shell history-shell" dir="ltr">
    <AppSidebar active="history" email={email} plan={plan} onNav={onNav} onPreferences={onPreferences} onSignOut={onSignOut}/>
    <main className="today-content history-content" dir="rtl">
      <section className="history-hero" aria-labelledby="history-title">
        <div className="history-hero-wave" aria-hidden="true"/>
        <div><h1 id="history-title">היסטוריה</h1><h2>כל פרקי הפודקאסט הקודמים שלך כאן</h2><p>האזינו מחדש, גלו תובנות קודמות וחזרו לרגעים החשובים.</p></div>
      </section>
      <div className="history-filters">
        <div className="history-topics" role="group" aria-label="סינון לפי נושא">
          <button aria-pressed={!topic} className={!topic?"selected":""} onClick={()=>setTopic("")}>כל הנושאים</button>
          {topics.map((t)=><button key={t} aria-pressed={topic===t} className={topic===t?"selected":""} onClick={()=>setTopic(t)}><bdi dir="auto">{t}</bdi></button>)}
        </div>
        <label className="history-year"><CalendarDays size={18}/><select aria-label="סינון לפי שנה" value={year} onChange={(e)=>setYear(e.target.value)}><option value="">כל השנים</option>{years.map((y)=><option key={y} value={String(y)}>{y}</option>)}</select></label>
      </div>
      <div className="history-list-heading"><span>נמצאו {episodes.length} פרקים</span><div><div className="history-library-filter" role="group" aria-label="סינון פרקים"><button className={!favoritesOnly?"selected":""} aria-pressed={!favoritesOnly} onClick={()=>setFavoritesOnly(false)}>כל הפרקים</button><button className={favoritesOnly?"selected":""} aria-pressed={favoritesOnly} onClick={()=>setFavoritesOnly(true)}><Heart size={15}/>מועדפים</button></div><label><ArrowDownUp size={18}/><select aria-label="סדר הפרקים" value={order} onChange={(e)=>setOrder(e.target.value)}><option value="newest">ממיינים מהחדש לישן</option><option value="oldest">ממיינים מהישן לחדש</option></select></label></div></div>
      {notice && <div className="history-notice" role="status"><span>{notice}</span><button aria-label="סגירת הודעה" onClick={()=>setNotice("")}><X size={16}/></button></div>}
      <div className="history-episodes">
        {episodes.map((b)=>{
          const duration=b.durationMs ?? b.chapters.reduce((sum,c)=>sum+(c.durationMs??0),0);
          const tags=topicTags(b).slice(0,3);
          const description=b.chapters.slice(0,3).map((c)=>c.title).filter(Boolean).join(" · ") || b.sources[0]?.title || "פרטים נוספים יהיו זמינים לאחר יצירת הפרק.";
          const validDate=Number.isFinite(new Date(b.createdAt).getTime());
          return <article className="history-row" key={b.id}>
            <button className="history-play" aria-label={`ניגון ${podcastDisplayTitle(b)}`} disabled={b.status!=="completed" || !b.audioUrl} onClick={()=>onPlay(b.id)}><Play size={23} fill="currentColor"/></button>
            <div className="history-meta" dir="rtl"><span><CalendarDays size={17}/>{validDate?<time dateTime={b.createdAt}>{new Intl.DateTimeFormat("he-IL",{day:"numeric",month:"long",year:"numeric",timeZone:"Asia/Jerusalem"}).format(new Date(b.createdAt))}</time>:"תאריך לא זמין"}</span><span><Clock3 size={17}/><bdi dir="ltr">{duration>0?seconds(duration):"משך לא זמין"}</bdi></span></div>
            <div className="history-copy" dir="rtl"><button className="history-episode-title" onClick={()=>onOpen(b.id)}><h3><bdi dir="auto">{podcastDisplayTitle(b)}</bdi></h3></button><p title={description}>{description}</p>{b.status!=="completed" && <small>{b.errorMessage || b.stageLabel || "הפרק עדיין אינו מוכן להאזנה."}</small>}</div>
            <div className="history-tags" dir="rtl">{tags.map((t)=><button key={t} onClick={()=>setTopic(t)}><bdi dir="auto">{t}</bdi></button>)}</div>
            <div className="history-actions" ref={menu===b.id?menuRef:undefined}>
              <button className="history-heart" aria-label={`${favorites.includes(b.id)?"הסרה ממועדפים":"הוספה למועדפים"}: ${podcastDisplayTitle(b)}`} aria-pressed={favorites.includes(b.id)} onClick={()=>toggleFavorite(b.id)}><Heart size={18} fill={favorites.includes(b.id)?"currentColor":"none"}/></button>
              <button className="history-dots" aria-label={`פעולות לפרק ${podcastDisplayTitle(b)}`} aria-expanded={menu===b.id} aria-haspopup="menu" onClick={()=>setMenu(menu===b.id?null:b.id)}><MoreVertical size={23}/></button>
              {menu===b.id && <div className="history-menu" role="menu" dir="rtl">
                <button role="menuitem" onClick={()=>void share(b)}><Share2 size={17}/>שיתוף</button>
              </div>}
            </div>
          </article>;
        })}
        {!episodes.length && <div className="history-empty"><h3>{briefs.length?"אין פרקים שתואמים למסננים":"הפודקאסטים שלך יופיעו כאן"}</h3><p>{briefs.length?"נסה נושא אחר או עבור אל כל הפרקים.":"לאחר יצירת פודקאסט, אפשר לחזור אליו ולהאזין כאן."}</p>{briefs.length>0 && <button onClick={()=>{setTopic("");setYear("");setFavoritesOnly(false);}}>כל הפרקים</button>}</div>}
      </div>
    </main>
  </div>;
}

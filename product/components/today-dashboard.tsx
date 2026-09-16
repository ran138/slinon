"use client";

import { useEffect, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { Sun, BriefcaseBusiness, Settings2, History, LogOut, Sparkles, ArrowLeft, Download, Share2, Play, Pause, Newspaper, AudioLines, FileText, Quote, ArrowUpRight } from "lucide-react";
import type { BriefView } from "@/lib/domain";
import { podcastDisplayTitle } from "@/lib/podcast/display";
import { Logo } from "@/components/logo";

type Destination = "dashboard" | "settings-portfolio" | "history" | "player" | "sources";
type TrackedAsset = { id: string; ticker: string; name: string };
// Mirrors lib/marketData.ts's MarketQuote — not imported directly since
// that module is server-only and this is a client component.
type MarketQuote = { price: number; currency: string | null; changePercent: number; logoUrl: string | null };
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

// Finnhub's free tier has no historical-candle access, so the trend line is a
// stable, per-ticker procedural squiggle biased toward the quote's actual
// direction — not real price history, just a visual echo of up/down.
function sparklinePath(seed: string, up: boolean): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const points = Array.from({ length: 8 }, () => { h = (h * 1103515245 + 12345) >>> 0; return (h % 1000) / 1000; });
  const width = 110, height = 32, step = width / (points.length - 1);
  return points.map((n, i) => {
    const bias = up ? i / (points.length - 1) : 1 - i / (points.length - 1);
    const y = Math.max(2, Math.min(height - 2, height - (bias * .65 + n * .35) * height));
    return `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}
const statusLabels: Record<BriefView["status"], string> = { queued: "בתור", researching: "אוספים מידע", scripting: "כותבים", synthesizing: "מכינים אודיו", completed: "מוכן להאזנה", failed: "היצירה לא הושלמה" };

function greetingForIsraelTime(): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", hour: "numeric", hour12: false }).format(new Date()));
  if (hour >= 5 && hour < 12) return "בוקר טוב";
  if (hour >= 12 && hour < 17) return "צהריים טובים";
  if (hour >= 17 && hour < 21) return "ערב טוב";
  return "לילה טוב";
}

function HeroArtwork() {
  return <div className="today-hero-art" aria-hidden="true"/>;
}

export function TodayDashboard({ assets, brief, player, email, plan, onNav, onSignOut, onGenerate, generating, canGenerate, onPreferences }: {
  assets: TrackedAsset[]; brief: BriefView | null; player: ReactNode; email: string | null; plan: "daily" | "weekly";
  onNav: (screen: Destination) => void; onSignOut: () => void; onGenerate: () => void; generating: boolean; canGenerate: boolean; preview?: boolean; onPreferences: () => void;
}) {
  const [quotes, setQuotes] = useState<Record<string, MarketQuote | null>>({});
  const tickerList = assets.map((asset) => asset.ticker).join(",");
  useEffect(() => {
    if (!tickerList) return;
    let ignore = false;
    fetch(`/api/market-data?tickers=${encodeURIComponent(tickerList)}`)
      .then((response) => (response.ok ? response.json() : {}))
      .then((data: Record<string, MarketQuote | null>) => { if (!ignore) setQuotes(data); })
      .catch(() => { /* asset cards fall back to "no market data" on failure */ });
    return () => { ignore = true; };
  }, [tickerList]);

  const date = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jerusalem" }).format(new Date());
  const personal = brief?.chapters.filter((chapter) => chapter.reasonKind !== "general") ?? [];
  const source = brief?.sources[0];
  const ready = brief?.status === "completed" && Boolean(brief.audioUrl);
  const insights = [
    { icon: AudioLines, title: "סקירת שווקים עדכנית", text: brief?.chapters[0]?.title ?? "סקירת השוק תופיע כאן כשהפודקאסט יהיה מוכן.", action: "player" as const },
    { icon: Sparkles, title: "חדשות שמעניינות אותך", text: personal[0] ? `${personal[0].reasonLabel} · ${personal[0].title}` : "התוכן מותאם לנכסים ולתחומי העניין שבחרת.", action: "player" as const },
    { icon: FileText, title: "מידע מבוסס מקורות", text: brief?.sources.length ? `${brief.sources.length} מקורות לפודקאסט, עם קישורים לקריאה נוספת.` : "קישורים למקורות יופיעו לצד התוכן כשיהיו זמינים.", action: "sources" as const },
  ];
  return <div className="today-shell" dir="ltr">
    <aside className="today-sidebar" dir="rtl" aria-label="ניווט ראשי">
      <div className="today-brand" dir="ltr"><strong>VESTORY</strong><span dir="rtl">כל מה שחשוב להשקעות שלך</span></div>
      <nav>{[
        { id: "dashboard" as const, label: "היום", icon: Sun }, { id: "settings-portfolio" as const, label: "המעקב שלי", icon: BriefcaseBusiness },
        { id: "preferences" as const, label: "העדפות", icon: Settings2 }, { id: "history" as const, label: "היסטוריה", icon: History },
      ].map(({ id, label, icon: Icon }) => <button key={id} className={id === "dashboard" ? "active" : ""} aria-current={id === "dashboard" ? "page" : undefined} onClick={() => id === "preferences" ? onPreferences() : onNav(id)}><Icon size={23}/><span>{label}</span></button>)}</nav>
      <div className="today-sidebar-bottom">
        <button className="today-account" onClick={onPreferences}><span className="today-avatar">{email?.[0]?.toUpperCase() ?? "V"}</span><span><strong>החשבון שלי</strong><small>{plan === "daily" ? "מסלול יומי" : "מסלול שבועי"}</small></span></button>
        {email && <bdi className="today-email ph-mask-text" dir="ltr">{email}</bdi>}
        <button className="today-logout" onClick={onSignOut}><LogOut size={16}/>התנתקות</button>
        <div className="today-powered"><Logo size="lg"/><span>מניעים אותך קדימה</span></div>
      </div>
    </aside>
    <main className="today-content" dir="rtl">
      {/* The explicit localhost preview uses QA fixtures; no debug copy is rendered. */}
      <section className="today-hero" aria-labelledby="today-greeting"><HeroArtwork/>
        <div className="today-hero-aside"><span>מידע חכם.</span><span>תוכן אישי.</span><span>בזמן שבחרת.</span></div>
        <div className="today-hero-heading"><h1 id="today-greeting">{greetingForIsraelTime()}</h1><h2>{ready ? "הפודקאסט שלך מוכן" : brief ? "מכינים את הפודקאסט שלך" : "הפודקאסט הבא מתחיל כאן"}</h2><p>כל מה שחשוב להשקעות שלך</p></div>
        <div className="today-hero-meta"><span>{date}</span><small>{plan === "weekly" ? "העדכון השבועי שלך" : "העדכון היומי שלך"}</small></div>
      </section>
      <div className="today-podcast-grid" dir="ltr">
        <section dir="rtl" aria-label="הפודקאסט שלך">{brief ? player : <div className="today-card today-empty"><AudioLines size={40}/><h2>העדכון הבא שלך מתחיל כאן</h2><p>{canGenerate ? "עדיין אין פודקאסט מוכן. אפשר ליצור עדכון אישי על הנכסים והנושאים שבחרת." : "בחרו נכסים ותחומי עניין כדי שנוכל להתאים עבורכם את הפודקאסט."}</p><button className="today-primary" disabled={generating} onClick={canGenerate ? onGenerate : () => onNav("settings-portfolio")}>{generating ? "יוצרים…" : canGenerate ? "יצירת פודקאסט" : "הוספת נכסים"}<ArrowLeft size={18}/></button></div>}</section>
        <aside className="today-card today-insights" dir="rtl"><div className="today-insights-heading"><Sparkles size={32}/><div><h2>מה מחכה לך היום?</h2><p>הפודקאסט מותאם אישית עבורך עם תובנות משמעותיות ביותר בשוק.</p></div></div>
          <div className="today-insight-list">{insights.map(({ title, text, icon: Icon, action }) => <button key={title} className="today-insight" disabled={!brief} onClick={() => onNav(action)}><Icon size={28}/><span><strong>{title}</strong><small>{text}</small></span></button>)}</div>
          <div className="today-quote"><Quote size={30}/><p>ידע טוב יותר.<br/>החלטות טובות יותר.</p><small dir="ltr">VESTORY</small></div>
        </aside>
      </div>
      <section className="today-quick" aria-labelledby="today-quick-heading"><div className="today-section-heading"><h2 id="today-quick-heading">תובנות מהירות</h2><button onClick={() => onNav("settings-portfolio")}>המעקב שלי <ArrowUpRight size={16}/></button></div>
        <div className="today-quick-grid" dir="ltr">
          {assets.map((asset) => {
            const related = personal.find((chapter) => chapter.reasonLabel.toUpperCase() === asset.ticker.toUpperCase() || chapter.reasonLabel.toUpperCase() === asset.name.toUpperCase());
            const quote = quotes[asset.ticker.trim().toUpperCase()];
            const isUp = quote ? quote.changePercent >= 0 : false;
            return <article key={asset.id} className="today-card today-asset" dir="rtl"><div className="today-asset-heading"><div className="today-asset-icon-col" dir="ltr"><span className="today-asset-icon">{quote?.logoUrl ? <img src={quote.logoUrl} alt="" referrerPolicy="no-referrer"/> : (asset.ticker === "SPY" ? "S&P" : asset.ticker.slice(0,4))}</span><bdi dir="ltr">{asset.ticker}</bdi></div><div className="today-asset-name-wrap" data-full-name={asset.name || asset.ticker}><h3><bdi dir="auto">{asset.name || asset.ticker}</bdi></h3></div><span className={`today-asset-change${quote ? (isUp ? " today-asset-change-up" : " today-asset-change-down") : ""}`} aria-label={quote ? `שינוי של ${quote.changePercent.toFixed(2)} אחוז` : "שינוי באחוזים אינו זמין"}>{quote ? `${isUp ? "+" : ""}${quote.changePercent.toFixed(2)}%` : "—"}</span></div><div className="today-asset-body">{quote ? <div className={`today-sparkline${isUp ? " today-sparkline-up" : " today-sparkline-down"}`} aria-label={`מחיר נוכחי ${quote.price}${quote.currency ? ` ${quote.currency}` : ""}`}><svg viewBox="0 0 110 32" aria-hidden="true"><defs><linearGradient id={`spark-${asset.id}`} x1="0" y1="0" x2="1" y2="0">{isUp ? <><stop offset="0" stopColor="#22d3ee"/><stop offset="1" stopColor="#3b82f6"/></> : <><stop offset="0" stopColor="#f87171"/><stop offset="1" stopColor="#ef4444"/></>}</linearGradient></defs><path d={sparklinePath(asset.ticker, isUp)} fill="none" stroke={`url(#spark-${asset.id})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div> : <div className="today-trend-empty" aria-label="נתוני מגמה אינם זמינים"><svg viewBox="0 0 110 65" aria-hidden="true"><defs><linearGradient id={`trend-${asset.id}`} x2="0" y2="1"><stop stopColor="#405ee4" stopOpacity=".2"/><stop offset="1" stopColor="#405ee4" stopOpacity="0"/></linearGradient></defs><rect width="110" height="65" fill={`url(#trend-${asset.id})`}/><path d="M0 18H110 M0 42H110 M20 0V65 M65 0V65" stroke="#557bb7" strokeOpacity=".15"/><path d="M8 33H102" stroke="#7194c8" strokeDasharray="3 5" strokeOpacity=".4"/></svg><small>אין נתוני שוק</small></div>}<p>{related?.title ?? "נכס במעקב שלך. אין נתונים חדשים."}</p></div>{related && <button className="today-asset-link" onClick={() => onNav("player")}><Sparkles size={15}/>למה זה בפודקאסט?</button>}</article>;
          })}
          {!assets.length && <article className="today-card today-asset" dir="rtl"><BriefcaseBusiness size={28}/><h3>המעקב שלך</h3><p>עוד לא נוספו נכסים למעקב. אפשר להוסיף נכסים או להאזין לפי תחומי העניין שלך.</p><button className="today-asset-link" onClick={() => onNav("settings-portfolio")}>הוספת נכס <ArrowLeft size={16}/></button></article>}
          <article className="today-card today-news" dir="rtl"><div className="today-news-heading"><Newspaper size={30}/><h3>חדשות מרכזיות</h3></div><span className="today-news-publisher">{source?.publisher ?? "מקורות הפודקאסט"}</span><p>{source?.title ?? "מקורות ועדכונים רלוונטיים יופיעו כאן יחד עם הפודקאסט שלך."}</p><button className="today-primary" disabled={!brief?.sources.length} onClick={() => onNav("sources")}>קרא עוד <ArrowLeft size={19}/></button></article>
        </div>
      </section>
    </main>
  </div>;
}

// Presentation only: all playback/seek state and effects stay in the existing PlayerScreen.
export function TodayPlayerCard({ brief, audioRef, playing, elapsed, totalDuration, progress, activeChapter, speed, onSpeed, onToggle, onSeek, onSeekChapter, onAudioPlay, onAudioPause, onAudioTime, onAudioEnd, onOpenPlayer }: {
  brief: BriefView; audioRef: RefObject<HTMLAudioElement | null>; playing: boolean; elapsed: number; totalDuration: number; progress: number; activeChapter: number; speed: number;
  onSpeed: (speed: number) => void; onToggle: () => void; onSeek: (seconds: number) => void; onSeekChapter: (index: number) => void;
  onAudioPlay: () => void; onAudioPause: () => void; onAudioTime: (seconds: number) => void; onAudioEnd: () => void; onOpenPlayer: () => void;
}) {
  const [message, setMessage] = useState("");
  const title = podcastDisplayTitle(brief);
  const playable = brief.status === "completed" && Boolean(brief.audioUrl);
  async function share() {
    const url = `${window.location.origin}/vestory_app`;
    try {
      if (navigator.share) await navigator.share({ title, text: title, url });
      else { await navigator.clipboard.writeText(url); setMessage("הקישור לאפליקציה הועתק. הפודקאסט האישי זמין לאחר התחברות."); }
    } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setMessage("לא הצלחנו לשתף. אפשר להעתיק את כתובת האפליקציה מהדפדפן."); }
  }
  return <div className="today-card today-player">
    {brief.audioUrl && <audio ref={audioRef} src={brief.audioUrl} preload="metadata" onPlay={onAudioPlay} onPause={onAudioPause} onTimeUpdate={(event) => onAudioTime(event.currentTarget.currentTime)} onEnded={onAudioEnd}/>}
    <div className="today-player-head"><div><div className="today-player-meta"><span>{new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" }).format(new Date(brief.createdAt))}</span><span className="today-status">{statusLabels[brief.status]}</span></div><h2 title={brief.title ?? title}><bdi dir="auto">{title}</bdi></h2><p><bdi dir="ltr">{time(totalDuration / 1000)}</bdi> דקות <span>·</span> {brief.chapters.length} נושאים</p></div></div>
    <div className="today-playback" dir="ltr"><button className="today-play" aria-label={playing ? "השהיית הפודקאסט" : "ניגון הפודקאסט"} disabled={!playable} onClick={onToggle}>{playing ? <Pause size={28} fill="currentColor"/> : <Play size={28} fill="currentColor"/>}</button><div className="today-timeline">
      <div className="today-wave" aria-hidden="true">{Array.from({ length: 64 }, (_, i) => <i key={i} style={{ height: `${24 + Math.sin(i * .4) * 13 + Math.abs(Math.sin(i * 1.1 + .7)) * 45}%`, background: i / 64 < progress ? "linear-gradient(180deg,#8e5cff,#2f86ff)" : undefined }}/>)}</div>
      <div className="today-slider-wrap">
        <div className="today-chapter-markers">{brief.chapters.map((chapter, index) => <button key={chapter.id} className={`today-chapter-marker${activeChapter === index ? " active" : ""}`} style={{ left: `${totalDuration ? (chapter.startMs / totalDuration) * 100 : 0}%` }} aria-label={chapter.title} title={chapter.title} disabled={!playable} onClick={() => onSeekChapter(index)}/>)}</div>
        <input aria-label="מיקום בפודקאסט" type="range" min="0" max={totalDuration / 1000 || 1} step=".1" value={Math.min(elapsed, totalDuration / 1000)} onChange={(event) => onSeek(Number(event.target.value))} disabled={!playable}/>
      </div>
      <div className="today-times"><span>{time(elapsed)}</span><span>{time(totalDuration / 1000)}</span></div></div></div>
    {!playable && <p className="today-audio-unavailable" role="status">{brief.errorMessage ?? (brief.status === "completed" ? "קובץ האודיו אינו זמין כרגע." : brief.stageLabel || "האודיו יהיה זמין כשהיצירה תסתיים.")}</p>}
    <div className="today-chapters">{brief.chapters.map((chapter, index) => <button key={chapter.id} className={playing && activeChapter === index ? "active" : ""} disabled={!playable} onClick={() => onSeekChapter(index)}><span className="today-chapter-dot"/><bdi dir="auto">{chapter.title}</bdi><time dir="ltr">{time(chapter.startMs / 1000)}</time></button>)}</div>
    <div className="today-player-secondary"><button onClick={onOpenPlayer}>פתיחה בנגן המלא <ArrowLeft size={15}/></button><button className="today-speed" aria-label="מהירות ניגון" onClick={() => onSpeed(speed === 1 ? 1.25 : speed === 1.25 ? 1.5 : speed === 1.5 ? 2 : 1)}>מהירות {speed}×</button></div>
    <div className="today-player-actions">{playable ? <a href={brief.audioUrl!} download={`${title}.mp3`}><Download size={22}/>הורדה</a> : <button disabled><Download size={22}/>הורדה</button>}<button onClick={() => void share()}><Share2 size={22}/>שיתוף</button></div>
    {message && <p className="today-action-message" role="status">{message}</p>}
  </div>;
}

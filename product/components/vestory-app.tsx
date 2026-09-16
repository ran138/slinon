"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent, MouseEvent as ReactMouseEvent } from "react";
import type { BriefView, ProfileUpdate } from "@/lib/domain";
import { Notice } from "@/components/notice";
import { Logo } from "@/components/logo";
import { VestoryWordmark } from "@/components/vestory-wordmark";
import { initAnalytics, identifyUser, resetAnalytics } from "@/lib/analytics";
import { LegalFooter } from "@/components/legal/footer";
import { TodayDashboard, TodayPlayerCard } from "@/components/today-dashboard";
import { TrackingPage } from "@/components/tracking-page";
import { INTERESTS, POPULAR_ASSETS, conceptKey, matchAsset, matchInterest, normalizeInterests, searchAssets, searchInterests } from "@/lib/onboarding";
import { targetMinutesForPlan } from "@/lib/schedule";

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen =
  | "welcome"
  | "portfolio-entry"
  | "portfolio-confirm"
  | "generating"
  | "dashboard"
  | "player"
  | "sources"
  | "settings-portfolio"
  | "history";

interface Holding {
  id: string;
  ticker: string;
  name: string;
  quantity: string;
  avgCost: string;
}

interface WatchItem {
  ticker: string;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSeconds(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

function formatBriefTimestamp(iso: string) {
  return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function fmtMs(ms?: number | null) {
  return formatSeconds((ms ?? 0) / 1000);
}

// ─── Small shared components ──────────────────────────────────────────────────

function TopBar({
  onNav, screen, onSignOut,
  podcastPlan, scheduleTime, scheduleDay, nextRunAt, notifyByEmail, onSaveSchedule,
}: {
  onNav: (s: Screen) => void; screen: Screen; onSignOut: () => void;
  podcastPlan: "daily" | "weekly"; scheduleTime: string; scheduleDay: number | null;
  nextRunAt: string | null; notifyByEmail: boolean;
  onSaveSchedule: (data: { podcastPlan: "daily" | "weekly"; scheduleTime: string; scheduleDay: number | null; notifyByEmail: boolean }) => Promise<void>;
}) {
  const showNav = ["dashboard", "player", "sources", "settings-portfolio", "history"].includes(screen);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const scheduleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scheduleOpen) return;
    function handleClick(e: MouseEvent) {
      if (scheduleRef.current && !scheduleRef.current.contains(e.target as Node)) setScheduleOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [scheduleOpen]);

  if (!showNav) return null;
  return (
    <header className="sticky top-0 z-50" style={{ borderBottom: "1px solid #292c3d", background: "rgba(9,10,17,0.92)", backdropFilter: "blur(18px)" }}>
      <div className="max-w-5xl mx-auto px-6 h-14 relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => onNav("dashboard")} className="flex items-center gap-2.5 group" style={{ background: "none", border: "none", cursor: "pointer" }}>
            <VestoryWordmark size="sm" />
          </button>
          <div ref={scheduleRef} style={{ position: "relative" }}>
            <button
              onClick={() => setScheduleOpen((v) => !v)}
              aria-label="הגדרות פודקאסט"
              style={{
                width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                background: scheduleOpen ? "rgba(123,111,245,0.15)" : "transparent",
                color: scheduleOpen ? "#7b6ff5" : "#9b9dae", border: "none", cursor: "pointer",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            {scheduleOpen && (
              <SchedulePanel
                podcastPlan={podcastPlan}
                scheduleTime={scheduleTime}
                scheduleDay={scheduleDay}
                nextRunAt={nextRunAt}
                notifyByEmail={notifyByEmail}
                onSave={async (data) => { await onSaveSchedule(data); setScheduleOpen(false); }}
              />
            )}
          </div>
        </div>
        <nav className="absolute flex items-center gap-1" style={{ left: "50%", transform: "translateX(-50%)" }}>
          {[
            { id: "dashboard" as Screen, label: "היום" },
            { id: "settings-portfolio" as Screen, label: "תיק" },
            { id: "history" as Screen, label: "היסטוריה" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              className="px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: screen === item.id ? "rgba(123,111,245,0.15)" : "transparent",
                color: screen === item.id ? "#7b6ff5" : "#9b9dae",
                border: "none", cursor: "pointer",
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button
          onClick={onSignOut}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-white/5"
          style={{ color: "#565968", border: "1px solid #292c3d", background: "none", cursor: "pointer" }}
        >
          התנתקות
        </button>
      </div>
    </header>
  );
}

function SchedulePanel({ podcastPlan, scheduleTime, scheduleDay, nextRunAt, notifyByEmail, onSave, inline = false }: {
  podcastPlan: "daily" | "weekly"; scheduleTime: string; scheduleDay: number | null;
  nextRunAt: string | null; notifyByEmail: boolean;
  onSave: (data: { podcastPlan: "daily" | "weekly"; scheduleTime: string; scheduleDay: number | null; notifyByEmail: boolean }) => Promise<void>;
  inline?: boolean;
}) {
  const [selectedPlan, setSelectedPlan] = useState<"daily" | "weekly">(podcastPlan);
  const [selectedTime, setSelectedTime] = useState(scheduleTime);
  const [selectedDay, setSelectedDay] = useState(
    scheduleDay !== null && scheduleDay >= 1 && scheduleDay <= 5 ? scheduleDay : 1,
  );
  const [emailNotify, setEmailNotify] = useState(notifyByEmail);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save() {
    setSaved("saving");
    try {
      await onSave({
        podcastPlan: selectedPlan,
        scheduleTime: selectedTime,
        scheduleDay: selectedPlan === "weekly" ? selectedDay : null,
        notifyByEmail: emailNotify,
      });
      setSaved("saved");
      setTimeout(() => setSaved("idle"), 1500);
    } catch { setSaved("error"); }
  }

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        position: inline ? "relative" : "absolute", top: inline ? undefined : "calc(100% + 8px)", right: 0, width: inline ? "100%" : 320, zIndex: 60,
        background: "#11131e", border: "1px solid #292c3d", boxShadow: "0 12px 40px rgba(0,0,0,0.5)", direction: "rtl",
      }}
    >
      <h3 className="text-sm font-semibold mb-1" style={{ color: "#f7f7fb" }}>תוכנית הפודקאסט</h3>
      <p className="text-xs mb-4" style={{ color: "#565968" }}>בחרו באיזו תדירות ומתי הפודקאסט יהיה מוכן.</p>

      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {[
          { id: "daily" as const, title: "תוכנית יומית", detail: "כ־5 דקות, בימים שני עד שישי" },
          { id: "weekly" as const, title: "תוכנית שבועית", detail: "כ־15 דקות פעם בשבוע" },
        ].map((plan) => {
          const selected = selectedPlan === plan.id;
          return (
            <button key={plan.id} onClick={() => setSelectedPlan(plan.id)} className="rounded-xl text-right transition-all" style={{
              minHeight: 66, padding: "10px 12px",
              background: selected ? "linear-gradient(130deg, rgba(123,111,245,0.28), rgba(91,138,240,0.22))" : "#181a26",
              color: selected ? "#fff" : "#9b9dae",
              border: `1px solid ${selected ? "rgba(123,111,245,0.65)" : "#292c3d"}`,
              cursor: "pointer",
            }}>
              <span className="block text-sm font-semibold">{plan.title}</span>
              <span className="block text-xs mt-1" style={{ color: selected ? "#c9c5ff" : "#565968" }}>{plan.detail}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: selectedPlan === "weekly" ? "1fr 1fr" : "1fr", alignItems: "end" }}>
        {selectedPlan === "weekly" && (
          <label className="text-xs" style={{ color: "#9b9dae" }}>
            יום בשבוע
            <select value={selectedDay} onChange={(event) => setSelectedDay(Number(event.target.value))} className="w-full mt-2 h-10 rounded-lg px-3" style={{ background: "#181a26", color: "#f7f7fb", border: "1px solid #292c3d", direction: "rtl" }}>
              {[
                { value: 1, label: "יום שני" },
                { value: 2, label: "יום שלישי" },
                { value: 3, label: "יום רביעי" },
                { value: 4, label: "יום חמישי" },
                { value: 5, label: "יום שישי" },
              ].map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs" style={{ color: "#9b9dae" }}>
          שעה שבה הפודקאסט יהיה מוכן
          <input type="time" value={selectedTime} onChange={(event) => setSelectedTime(event.target.value)} className="w-full mt-2 h-10 rounded-lg px-3" style={{ background: "#181a26", color: "#f7f7fb", border: "1px solid #292c3d", direction: "ltr" }} />
        </label>
      </div>

      <p className="text-xs mt-3" style={{ color: "#565968" }}>
        {selectedPlan === "daily" ? "הפודקאסט יוכן בימים שני עד שישי בלבד · " : ""}
        אזור זמן: ישראל (Asia/Jerusalem)
        {nextRunAt ? ` · הפודקאסט הבא: ${new Date(nextRunAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}
      </p>

      <div className="flex items-center justify-between" style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #292c3d" }}>
        <div>
          <p className="text-sm font-medium" style={{ color: "#f7f7fb" }}>מייל כשהפודקאסט מוכן</p>
          <p className="text-xs mt-0.5" style={{ color: "#565968" }}>קישור להאזנה, בשעה שבחרתם למעלה.</p>
        </div>
        <button
          onClick={() => setEmailNotify((v) => !v)}
          role="switch"
          aria-checked={emailNotify}
          style={{
            flexShrink: 0, width: 40, height: 24, borderRadius: 999, position: "relative",
            background: emailNotify ? "linear-gradient(130deg, #7b6ff5, #5b8af0)" : "#292c3d",
            border: "none", cursor: "pointer", transition: "background 0.2s",
          }}
        >
          <span style={{
            position: "absolute", top: 3, width: 18, height: 18, borderRadius: "50%", background: "#fff",
            right: emailNotify ? 3 : 19, transition: "right 0.2s",
          }} />
        </button>
      </div>

      {saved === "error" && <p className="text-xs mt-3" style={{ color: "#f87171" }}>שמירת השינויים נכשלה.</p>}
      <button onClick={save} disabled={saved === "saving"} className="mt-4 w-full h-9 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95" style={{ background: "linear-gradient(130deg, #7b6ff5, #5b8af0)", border: "none", cursor: saved === "saving" ? "not-allowed" : "pointer" }}>
        {saved === "saving" ? "שומר…" : saved === "saved" ? "נשמר ✓" : "שמירת שינויים"}
      </button>
    </div>
  );
}

// ─── Screens ──────────────────────────────────────────────────────────────────

function WelcomeScreen({ onNext }: { onNext: () => void }) {
  const benefits = [
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
        </svg>
      ),
      title: "מותאם אליך",
      desc: "לפי תיק ההשקעות, הנכסים שעוקבים אחריהם והתחומים שמעניינים אותך.",
    },
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
      ),
      title: "חוסך לך זמן",
      desc: "במקום לעבור על חדשות ופודקאסטים — רק מה שבאמת חשוב לך.",
    },
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      ),
      title: "מבוסס על מקורות",
      desc: "לכל נושא בפודקאסט ניתן לראות את המקורות שעליהן הוא מבוסס.",
    },
  ];

  const previewTopics = [
    { color: "#34d399", label: "NVIDIA עלתה 4.3% — איך זה משפיע על התיק שלך" },
    { color: "#9d94f7", label: "הריבית בארה״ב — איך היא רלוונטית לחשיפה שלך לטכנולוגיה" },
    { color: "#5b8af0", label: "כלכלת ישראל — עדכון מהתחומים שמעניינים אותך" },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-start px-6 pt-10 pb-14 relative overflow-hidden">
      <div className="absolute pointer-events-none" style={{
        width: 800, height: 600, top: -160, left: "50%", transform: "translateX(-50%)",
        background: "radial-gradient(ellipse 60% 55% at 50% 35%, rgba(105,90,230,0.22) 0%, rgba(80,120,240,0.10) 50%, transparent 75%)",
      }} />
      <div className="absolute pointer-events-none" style={{ width: 500, height: 400, bottom: 120, left: -100, background: "radial-gradient(ellipse, rgba(91,138,240,0.09) 0%, transparent 65%)" }} />
      <div className="absolute pointer-events-none" style={{ width: 380, height: 300, bottom: 60, right: -80, background: "radial-gradient(ellipse, rgba(123,111,245,0.07) 0%, transparent 65%)" }} />

      <div className="relative z-10 flex flex-col items-center w-full max-w-[500px] text-center" style={{ gap: "1.5rem" }}>
        <div className="flex flex-col items-center" style={{ gap: "0.75rem" }}>
          <h1 style={{ margin: 0 }}><VestoryWordmark size="lg" /></h1>
          <div className="flex items-center justify-center" style={{ gap: "0.55rem", direction: "ltr", isolation: "isolate" }}>
            <span style={{ color: "#8a8aaa", fontSize: "0.82rem", fontWeight: 500, letterSpacing: "0.03em" }}>by</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/slinon-logo-transparent.png" alt="Slinon" style={{ width: 112, height: "auto", opacity: 1, display: "block" }} />
          </div>
          <p style={{ fontSize: "1.05rem", fontWeight: 500, lineHeight: 1.5, color: "#c8c8de", maxWidth: 380 }}>
            כל מה שחשוב להשקעות שלך — ב־3-10 דקות
          </p>
          <p style={{ fontSize: "0.85rem", lineHeight: 1.65, color: "#8a8aaa", maxWidth: 400 }}>
            VESTORY מסנן עבורך את חדשות השוק ומסביר מה התרחש, מדוע זה חשוב לתיק שלך ולנושאים שמעניינים אותך — בפודקאסט אישי בעברית.
          </p>
        </div>

        <button
          onClick={onNext}
          className="w-full relative overflow-hidden group transition-all active:scale-[0.98]"
          style={{
            height: 52, borderRadius: 14, fontWeight: 700, fontSize: "0.9rem", color: "#fff",
            background: "linear-gradient(130deg, #7b6ff5 0%, #6055e0 45%, #5b8af0 100%)",
            boxShadow: "0 2px 20px rgba(110,95,240,0.45), 0 1px 0 rgba(255,255,255,0.14) inset",
            border: "none", cursor: "pointer",
          }}
        >
          <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-[14px]" style={{ background: "linear-gradient(130deg, rgba(255,255,255,0.09) 0%, transparent 60%)" }} />
          <span className="relative">יצירת הפודקאסט הראשון שלי ←</span>
        </button>

        <div className="w-full rounded-2xl text-right overflow-hidden" style={{
          background: "linear-gradient(155deg, rgba(28,28,40,0.96) 0%, rgba(18,18,28,0.98) 100%)",
          border: "1px solid rgba(123,111,245,0.18)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.035) inset, 0 12px 48px rgba(0,0,0,0.5), 0 0 40px rgba(100,90,230,0.09)",
        }}>
          <div style={{ height: 1, background: "linear-gradient(90deg, transparent 5%, #7b6ff5 38%, #5b8af0 62%, transparent 95%)" }} />
          <div style={{ padding: "16px 20px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, direction: "rtl" }}>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#d0d0e8" }}>הפודקאסט של היום</p>
                <p style={{ fontSize: 11, color: "#6a6a88", marginTop: 1 }}>4 נושאים • מותאם אישית</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, direction: "ltr" }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: "linear-gradient(135deg, rgba(123,111,245,0.3), rgba(91,138,240,0.25))", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(123,111,245,0.2)" }}>
                  <svg width="9" height="10" viewBox="0 0 9 10" fill="none">
                    <path d="M1 1.5L8 5L1 8.5V1.5Z" fill="#9d94f7" stroke="#9d94f7" strokeWidth="0.5" strokeLinejoin="round" />
                  </svg>
                </div>
                <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(155,148,230,0.7)", fontVariantNumeric: "tabular-nums" }}>6:24</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 20, marginBottom: 14, opacity: 0.45, direction: "ltr" }}>
              {Array.from({ length: 52 }).map((_, i) => (
                <div key={i} style={{ flex: 1, borderRadius: 99, height: `${20 + Math.sin(i * 0.5) * 14 + Math.abs(Math.sin(i * 0.9)) * 22}%`, background: i < 14 ? "linear-gradient(to top, #7b6ff5, #7bb3f5)" : "rgba(255,255,255,0.09)" }} />
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, direction: "rtl" }}>
              {previewTopics.map((t) => (
                <div key={t.label} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, marginTop: 5, background: t.color, boxShadow: `0 0 6px ${t.color}55` }} />
                  <span style={{ fontSize: "0.78rem", lineHeight: 1.45, color: "#b0b0cc", textAlign: "right" }}>{t.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="w-full grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          {benefits.map((b) => (
            <div key={b.title} className="flex flex-col text-right" style={{ gap: 8, padding: "13px 13px 14px", borderRadius: 14, background: "rgba(24,24,34,0.75)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(10px)" }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(123,111,245,0.14)", color: "#a099f5", display: "flex", alignItems: "center", justifyContent: "center", marginLeft: "auto", border: "1px solid rgba(123,111,245,0.16)" }}>
                {b.icon}
              </div>
              <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "#dcdcee", lineHeight: 1.3 }}>{b.title}</p>
              <p style={{ fontSize: "0.72rem", lineHeight: 1.55, color: "#747494" }}>{b.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Popular assets catalog ────────────────────────────────────────────────────

const INITIAL_POPULAR = POPULAR_ASSETS.slice(0, 6);

// ─── Portfolio entry draft (persists through back navigation, in-memory only) ─

interface PortfolioDraft {
  freeText: string;
  pickedAssets: { ticker: string; name: string }[];
  confirmedScreenshot: boolean;
  detectedAssets: { ticker: string; name: string }[];
  selectedInterests: string[];
  customInterests: string[];
}

// ─── PortfolioEntryScreen ─────────────────────────────────────────────────────

function PortfolioEntryScreen({
  onNext, onBack, draft, onDraftChange,
}: {
  onNext: (holdings: Holding[], interests: string[], source: string) => Promise<void>;
  onBack: () => void;
  draft: PortfolioDraft;
  onDraftChange: (d: PortfolioDraft) => void;
}) {
  const [freeText, setFreeText] = useState(draft.freeText);
  const [textFocused, setTextFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [pickedAssets, setPickedAssets] = useState<{ ticker: string; name: string }[]>(draft.pickedAssets);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "analyzing" | "detected" | "error">(draft.confirmedScreenshot ? "detected" : "idle");
  const [detectedAssets, setDetectedAssets] = useState<{ ticker: string; name: string }[]>(draft.detectedAssets);
  const [confirmedScreenshot, setConfirmedScreenshot] = useState(draft.confirmedScreenshot);
  const [uploadError, setUploadError] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const [continueBusy, setContinueBusy] = useState(false);
  const [continueError, setContinueError] = useState("");
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [selectedInterests, setSelectedInterests] = useState<string[]>(draft.selectedInterests);
  const [customInput, setCustomInput] = useState("");
  const [customInterests, setCustomInterests] = useState<string[]>(draft.customInterests);
  const [showCustomInput, setShowCustomInput] = useState(false);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.max(80, textareaRef.current.scrollHeight)}px`;
    }
  }, [freeText]);

  const searchResults = searchAssets(searchQuery);
  const interestResults = searchInterests(customInput);

  const visiblePopular = showAll ? POPULAR_ASSETS : INITIAL_POPULAR;

  function togglePicked(ticker: string, name: string) {
    if (!pickedAssets.find((item) => item.ticker === ticker)) setValidationAttempted(false);
    setPickedAssets((prev) => (prev.find((p) => p.ticker === ticker) ? prev.filter((p) => p.ticker !== ticker) : [...prev, { ticker, name }]));
  }
  function isPicked(ticker: string) {
    return pickedAssets.some((p) => p.ticker === ticker);
  }

  function toggleInterest(id: string) {
    if (!selectedInterests.includes(id)) setValidationAttempted(false);
    setSelectedInterests((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function addCustomInterest() {
    const value = matchInterest(customInput) ?? customInput.trim();
    if (value && ![...selectedInterests, ...customInterests].some((item) => conceptKey(item) === conceptKey(value))) {
      setValidationAttempted(false);
      if (INTERESTS.some((item) => item.id === value)) setSelectedInterests((prev) => [...prev, value]);
      else setCustomInterests((prev) => [...prev, value]);
    }
    setCustomInput("");
    setShowCustomInput(false);
  }

  function removeCustomInterest(value: string) {
    setCustomInterests((prev) => prev.filter((item) => item !== value));
  }

  function onboardingApiPath(path: string) {
    const query = new URLSearchParams(window.location.search);
    const isLocalPreview = ["localhost", "127.0.0.1"].includes(window.location.hostname) && query.get("preview") === "onboarding";
    return isLocalPreview ? `${path}?preview=onboarding` : path;
  }

  async function handleFileSelect(file: File) {
    setUploadFile(file);
    setUploadState("analyzing");
    setConfirmedScreenshot(false);
    setUploadError("");
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const r = await fetch(onboardingApiPath("/api/portfolio/parse-image"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageDataUrl: dataUrl }) });
      const data = (await r.json().catch(() => ({}))) as { assets?: { symbol: string; name: string }[]; error?: string };
      if (!r.ok) throw new Error(data.error || "ניתוח הצילום נכשל.");
      const assets = (data.assets ?? []).map((a) => ({ ticker: a.symbol, name: a.name }));
      setDetectedAssets(assets);
      if (assets.length) setUploadState("detected");
      else { setUploadState("error"); setUploadError("לא זיהינו נכסים בתמונה. אפשר לנסות תמונה ברורה יותר."); }
    } catch (e) {
      setUploadState("error");
      setUploadError(e instanceof Error ? e.message : "ניתוח הצילום נכשל.");
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) void handleFileSelect(file);
  }

  const hasText = freeText.trim().length > 0;
  const hasPicked = pickedAssets.length > 0;
  const hasScreenshot = confirmedScreenshot && detectedAssets.length > 0;
  const hasInterest = selectedInterests.length > 0 || customInterests.length > 0;
  const hasAnyInput = hasText || hasPicked || hasScreenshot || hasInterest;

  function saveDraft() {
    onDraftChange({ freeText, pickedAssets, confirmedScreenshot, detectedAssets, selectedInterests, customInterests });
  }

  async function handleContinue() {
    saveDraft();
    if (!hasAnyInput) {
      setValidationAttempted(true);
      return;
    }
    setContinueBusy(true);
    setContinueError("");
    try {
      let fromText: Holding[] = [];
      let fromTextInterests: string[] = [];
      if (freeText.trim()) {
        const r = await fetch(onboardingApiPath("/api/portfolio/parse"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: freeText }) });
        const data = (await r.json().catch(() => ({}))) as { assets?: { symbol: string; name: string; quantity: string | null; averageCost: string | null }[]; interests?: string[]; error?: string };
        if (!r.ok) throw new Error(data.error || "לא הצלחנו לזהות את הנכסים והנושאים.");
        fromText = (data.assets ?? []).map((a, i) => ({ id: `p-${Date.now()}-${i}`, ticker: a.symbol, name: a.name, quantity: a.quantity ?? "", avgCost: a.averageCost ?? "" }));
        fromTextInterests = data.interests ?? [];
      }

      const parsedTickers = new Set(fromText.map((h) => h.ticker.toLocaleUpperCase()));
      const fromPicked: Holding[] = pickedAssets
        .filter((a) => !parsedTickers.has(a.ticker.toLocaleUpperCase()))
        .map((a, i) => ({ id: `pk-${i}`, ticker: a.ticker, name: a.name, quantity: "", avgCost: "" }));

      const fromScreenshot: Holding[] = hasScreenshot
        ? detectedAssets.filter((a) => !parsedTickers.has(a.ticker.toLocaleUpperCase()) && !fromPicked.some((p) => p.ticker.toLocaleUpperCase() === a.ticker.toLocaleUpperCase())).map((a, i) => ({ id: `sc-${i}`, ticker: a.ticker, name: a.name, quantity: "", avgCost: "" }))
        : [];

      const all = Array.from(new Map([...fromText, ...fromPicked, ...fromScreenshot].map((holding) => {
        const known = matchAsset(holding.ticker, false) ?? matchAsset(holding.name, false);
        const row = known ? { ...holding, ticker: known.ticker, name: known.name } : holding;
        return [conceptKey(row.ticker), row];
      })).values());
      const allInterests = normalizeInterests([...selectedInterests, ...customInterests, ...fromTextInterests])
        .filter((label) => !all.some((asset) => conceptKey(asset.name) === conceptKey(label) || matchAsset(label, false)?.ticker === asset.ticker));
      await onNext(all, allInterests, JSON.stringify({ freeText, pickedAssets, confirmedScreenshot, detectedAssets, selectedInterests, customInterests }));
    } catch (e) {
      setContinueError(e instanceof Error ? e.message : "לא הצלחנו לזהות את הנכסים והנושאים.");
    } finally {
      setContinueBusy(false);
    }
  }

  const cardStyle: CSSProperties = {
    borderRadius: 18,
    background: "linear-gradient(155deg, rgba(26,26,40,0.97) 0%, rgba(18,18,30,0.98) 100%)",
    border: "1px solid rgba(123,111,245,0.16)",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.03) inset, 0 8px 40px rgba(0,0,0,0.38)",
    overflow: "hidden",
  };
  const accentLine = <div style={{ height: 1, background: "linear-gradient(90deg, transparent 5%, #7b6ff5 38%, #5b8af0 62%, transparent 95%)" }} />;

  return (
    <div className="min-h-screen flex flex-col items-center justify-start px-6 py-12 relative overflow-hidden">
      <div className="absolute pointer-events-none" style={{ width: 640, height: 520, top: "40%", left: "50%", transform: "translate(-50%, -50%)", background: "radial-gradient(ellipse 55% 55% at 50% 48%, rgba(100,88,230,0.14) 0%, rgba(80,120,240,0.06) 50%, transparent 72%)" }} />

      <div className="relative z-10 w-full max-w-[560px]" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div dir="rtl" style={{ display: "flex", flexDirection: "column", gap: 6, textAlign: "right" }}>
          <h2 style={{ fontSize: "1.65rem", fontWeight: 700, color: "#eeeef2", letterSpacing: "-0.02em", margin: 0 }}>מה מעניין אתכם בעולם ההשקעות?</h2>
          <p style={{ fontSize: "0.92rem", lineHeight: 1.65, color: "#a0a0bc", margin: 0 }}>
            ספרו לנו אילו נכסים אתם מחזיקים או עוקבים אחריהם, ואילו נושאים מעניינים אתכם — כדי ש-<bdi dir="ltr">Vestory</bdi> יוכל להתאים לכם תוכן אישי ורלוונטי יותר.
          </p>
        </div>

        <div style={{
          ...cardStyle,
          border: `1px solid ${textFocused ? "rgba(123,111,245,0.42)" : "rgba(123,111,245,0.18)"}`,
          boxShadow: textFocused ? "0 0 0 3px rgba(123,111,245,0.1), 0 12px 48px rgba(0,0,0,0.45), 0 0 40px rgba(100,90,230,0.12)" : "0 0 0 1px rgba(255,255,255,0.04) inset, 0 12px 48px rgba(0,0,0,0.4), 0 0 32px rgba(100,90,230,0.07)",
          transition: "border-color 0.2s, box-shadow 0.2s",
        }}>
          {accentLine}
          <div style={{ padding: "16px 20px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5a5a80" }}>כתיבה חופשית</span>
            </div>
            <label style={{ display: "block", marginBottom: 8, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5a5a80" }}>
              כתבו נכסים או נושאים שמעניינים אתכם
            </label>
            <textarea
              ref={textareaRef}
              value={freeText}
              onChange={(e) => { setFreeText(e.target.value); if (e.target.value.trim()) setValidationAttempted(false); }}
              onFocus={() => setTextFocused(true)}
              onBlur={() => setTextFocused(false)}
              placeholder="לדוגמה: NVIDIA, S&P 500, זהב, AI"
              style={{ width: "100%", minHeight: 80, background: "transparent", border: "none", outline: "none", resize: "none", fontFamily: "Heebo, sans-serif", fontSize: "1rem", lineHeight: 1.7, color: "#eeeef2", direction: "rtl", caretColor: "#7b6ff5" }}
            />
          </div>
        </div>

        <div style={cardStyle}>
          {accentLine}
          <button onClick={() => setPickerOpen((v) => !v)} style={{ width: "100%", padding: "15px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", fontFamily: "Heebo, sans-serif", textAlign: "right" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, direction: "rtl" }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: "rgba(123,111,245,0.13)", border: "1px solid rgba(123,111,245,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9d94f7" strokeWidth="2" strokeLinecap="round"><path d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" /></svg>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: "0.88rem", fontWeight: 700, color: "#d0d0e8", margin: 0 }}>בחירת נכסים</p>
                <p style={{ fontSize: "0.72rem", color: "#686888", margin: 0 }}>בחרו מהרשימה או חפשו את הנכס שלכם</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {pickedAssets.length > 0 && <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#9d94f7", background: "rgba(123,111,245,0.15)", border: "1px solid rgba(123,111,245,0.25)", padding: "1px 8px", borderRadius: 10 }}>{pickedAssets.length}</span>}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#505070" strokeWidth="2" style={{ transform: pickerOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}><polyline points="6 9 12 15 18 9" /></svg>
            </div>
          </button>

          {pickerOpen && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "16px 20px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, height: 42, padding: "0 14px", borderRadius: 12, marginBottom: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(123,111,245,0.2)" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#505070" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="חיפוש לפי שם, סימבול או מספר נייר" style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: "0.88rem", color: "#d0d0ee", fontFamily: "Heebo, sans-serif", direction: "rtl", caretColor: "#7b6ff5" }} />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#505070", lineHeight: 0, padding: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                )}
              </div>

              {searchQuery.trim().length > 0 ? (
                <div style={{ marginBottom: 14 }}>
                  {searchResults.length === 0 ? (
                    <p style={{ fontSize: "0.78rem", color: "#505070", textAlign: "center", padding: "10px 0" }}>לא נמצאו תוצאות</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {searchResults.map((asset) => {
                        const picked = isPicked(asset.ticker);
                        return (
                          <div key={asset.ticker} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", borderRadius: 10, background: picked ? "rgba(123,111,245,0.12)" : "rgba(255,255,255,0.03)", border: `1px solid ${picked ? "rgba(123,111,245,0.3)" : "rgba(255,255,255,0.07)"}`, direction: "rtl" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: "rgba(123,111,245,0.12)", border: "1px solid rgba(123,111,245,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "#9d94f7", fontFamily: "JetBrains Mono, monospace", direction: "ltr" }}>{asset.ticker.replace(/[^A-Z]/g, "").slice(0, 2) || asset.ticker.slice(0, 2)}</span>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "#d0d0e8", margin: 0 }}>{asset.nameHe ?? asset.name}</p>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#7b6ff5", fontFamily: "JetBrains Mono, monospace", direction: "ltr" }}>{asset.ticker}</span>
                                  {asset.secNum && <span style={{ fontSize: "0.68rem", color: "#484868" }}>{asset.secNum}</span>}
                                </div>
                              </div>
                            </div>
                            <button onClick={() => togglePicked(asset.ticker, asset.nameHe ?? asset.name)} style={{ padding: "4px 12px", borderRadius: 8, flexShrink: 0, fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", fontFamily: "Heebo, sans-serif", transition: "all 0.18s", background: picked ? "rgba(52,211,153,0.14)" : "rgba(123,111,245,0.14)", border: picked ? "1px solid rgba(52,211,153,0.3)" : "1px solid rgba(123,111,245,0.3)", color: picked ? "#34d399" : "#9d94f7" }}>
                              {picked ? "הוסף ✓" : "+ הוספה"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <p style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#484868", marginBottom: 10 }}>נכסים פופולריים</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {visiblePopular.map((asset) => {
                      const picked = isPicked(asset.ticker);
                      return (
                        <button key={asset.ticker} onClick={() => togglePicked(asset.ticker, asset.nameHe ?? asset.name)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", borderRadius: 10, width: "100%", background: picked ? "rgba(123,111,245,0.12)" : "rgba(255,255,255,0.025)", border: `1px solid ${picked ? "rgba(123,111,245,0.3)" : "rgba(255,255,255,0.06)"}`, cursor: "pointer", transition: "all 0.15s", fontFamily: "Heebo, sans-serif", direction: "rtl" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: "0.88rem", fontWeight: 600, color: picked ? "#d0d0ee" : "#a0a0c0" }}>{asset.nameHe ?? asset.name}</span>
                            <span style={{ fontSize: "0.7rem", fontWeight: 700, color: picked ? "#9d94f7" : "#585878", fontFamily: "JetBrains Mono, monospace", direction: "ltr" }}>{asset.ticker}</span>
                          </div>
                          <div style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, background: picked ? "rgba(52,211,153,0.18)" : "transparent", border: `1.5px solid ${picked ? "#34d399" : "rgba(255,255,255,0.12)"}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                            {picked && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3.5"><polyline points="20 6 9 17 4 12" /></svg>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {!showAll && POPULAR_ASSETS.length > INITIAL_POPULAR.length && (
                    <button onClick={() => setShowAll(true)} style={{ marginTop: 10, width: "100%", padding: "8px 0", borderRadius: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.08)", fontSize: "0.8rem", color: "#686888", cursor: "pointer", fontFamily: "Heebo, sans-serif", transition: "all 0.2s" }}>
                      הצגת כל הנכסים ↓
                    </button>
                  )}
                </>
              )}

              {pickedAssets.length > 0 && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <p style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#484868", marginBottom: 8 }}>נכסים שנבחרו</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, direction: "rtl" }}>
                    {pickedAssets.map((a) => (
                      <div key={a.ticker} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px 4px 10px", borderRadius: 8, background: "rgba(123,111,245,0.13)", border: "1px solid rgba(123,111,245,0.26)" }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#c4beff" }}>{a.name}</span>
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#7b6ff5", fontFamily: "JetBrains Mono, monospace", direction: "ltr" }}>{a.ticker}</span>
                        <button onClick={() => togglePicked(a.ticker, a.name)} style={{ background: "none", border: "none", cursor: "pointer", color: "#505070", lineHeight: 0, padding: 0, marginRight: 2 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={cardStyle}>
          {accentLine}
          <button onClick={() => setUploadOpen((v) => !v)} style={{ width: "100%", padding: "15px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", fontFamily: "Heebo, sans-serif", textAlign: "right" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, direction: "rtl" }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: "rgba(91,138,240,0.13)", border: "1px solid rgba(91,138,240,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7bb3f5" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: "0.88rem", fontWeight: 700, color: "#d0d0e8", margin: 0 }}>העלאת צילום מסך</p>
                <p style={{ fontSize: "0.72rem", color: "#686888", margin: 0 }}>VESTORY יזהה את הנכסים עבורכם</p>
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#505070" strokeWidth="2" style={{ transform: uploadOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}><polyline points="6 9 12 15 18 9" /></svg>
          </button>

          {uploadOpen && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "16px 20px 18px" }}>
              <p style={{ fontSize: "0.78rem", lineHeight: 1.6, color: "#686888", margin: "0 0 14px" }}>אפשר להעלות צילום מסך של תיק ההשקעות כדי ש-VESTORY יזהה את הנכסים עבורכם.</p>

              {uploadState === "idle" && (
                <>
                  <input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/jpg" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFileSelect(f); }} />
                  <div
                    onClick={() => uploadRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    style={{ borderRadius: 14, padding: "28px 20px", textAlign: "center", cursor: "pointer", background: dragOver ? "rgba(91,138,240,0.1)" : "rgba(255,255,255,0.025)", border: `1.5px dashed ${dragOver ? "rgba(91,138,240,0.5)" : "rgba(255,255,255,0.12)"}`, transition: "all 0.2s" }}
                  >
                    <div style={{ width: 40, height: 40, borderRadius: 12, margin: "0 auto 12px", background: "rgba(91,138,240,0.13)", border: "1px solid rgba(91,138,240,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7bb3f5" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                    </div>
                    <p style={{ fontSize: "0.88rem", fontWeight: 600, color: "#a0a0c0", margin: "0 0 4px" }}>העלאת קובץ</p>
                    <p style={{ fontSize: "0.72rem", color: "#505070", margin: "0 0 8px" }}>או גררו צילום מסך לכאן</p>
                    <p style={{ fontSize: "0.68rem", color: "#404060", margin: 0 }}>PNG, JPG או JPEG</p>
                  </div>
                </>
              )}

              {uploadState === "analyzing" && (
                <div style={{ borderRadius: 14, padding: "20px", textAlign: "center", background: "rgba(91,138,240,0.06)", border: "1px solid rgba(91,138,240,0.16)" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", margin: "0 auto 12px", background: "conic-gradient(from 0deg, #5b8af0, transparent)", animation: "spin-slow 1.1s linear infinite", WebkitMask: "radial-gradient(circle at center, transparent 12px, black 14px)", mask: "radial-gradient(circle at center, transparent 12px, black 14px)" }} />
                  <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "#a0a0c0", margin: "0 0 4px" }}>מנתח את הצילום מסך...</p>
                  <p style={{ fontSize: "0.73rem", color: "#505070", margin: 0 }}>{uploadFile?.name}</p>
                </div>
              )}

              {uploadState === "detected" && (
                <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(91,138,240,0.2)" }}>
                  <div style={{ padding: "12px 16px 10px", background: "rgba(91,138,240,0.07)", direction: "rtl" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                      <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "#c0c0de", margin: 0 }}>{uploadFile?.name}</p>
                    </div>
                    <p style={{ fontSize: "0.75rem", color: "#686888", margin: 0 }}>זיהינו את הנכסים הבאים — בדקו שהכול נכון לפני שממשיכים.</p>
                  </div>
                  <div style={{ padding: "10px 16px 14px", direction: "rtl" }}>
                    {detectedAssets.map((a) => (
                      <div key={a.ticker} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                          <span style={{ fontSize: "0.85rem", color: "#c0c0de" }}>{a.name}</span>
                          <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#7b6ff5", fontFamily: "JetBrains Mono, monospace", direction: "ltr" }}>{a.ticker}</span>
                        </div>
                      </div>
                    ))}
                    <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button onClick={() => { setUploadState("idle"); setUploadFile(null); setDetectedAssets([]); setConfirmedScreenshot(false); }} style={{ padding: "6px 14px", borderRadius: 8, fontSize: "0.78rem", fontWeight: 600, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#686888", cursor: "pointer", fontFamily: "Heebo, sans-serif" }}>ביטול</button>
                      <button onClick={() => { setConfirmedScreenshot(true); setValidationAttempted(false); }} style={{ padding: "6px 16px", borderRadius: 8, fontSize: "0.78rem", fontWeight: 700, background: confirmedScreenshot ? "rgba(52,211,153,0.15)" : "linear-gradient(130deg, #7b6ff5, #5b8af0)", border: confirmedScreenshot ? "1px solid rgba(52,211,153,0.35)" : "none", color: confirmedScreenshot ? "#34d399" : "#fff", cursor: "pointer", fontFamily: "Heebo, sans-serif" }}>
                        {confirmedScreenshot ? "אושר ✓" : "אישור ומשך"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {uploadState === "error" && <Notice tone="error">{uploadError || "ניתוח הצילום נכשל."}</Notice>}
            </div>
          )}
        </div>

        <div style={cardStyle}>
          {accentLine}
          <div style={{ padding: "18px 20px 20px" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#d0d0ea", margin: "0 0 6px" }}>תחומי עניין</h3>
            <p style={{ fontSize: "0.78rem", lineHeight: 1.6, color: "#686888", margin: "0 0 14px" }}>נושאים שתרצו לשמוע עליהם בפודקאסט גם כשהם לא קשורים ישירות לנכס בתיק.</p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
              {INTERESTS.map((interest) => {
                const selected = selectedInterests.includes(interest.id);
                return (
                  <button key={interest.id} onClick={() => toggleInterest(interest.id)} style={{
                    padding: "6px 14px", borderRadius: 20, fontSize: "0.82rem", fontWeight: selected ? 600 : 500, fontFamily: "Heebo, sans-serif", cursor: "pointer", transition: "all 0.18s",
                    background: selected ? "linear-gradient(130deg, rgba(123,111,245,0.28), rgba(91,138,240,0.22))" : "rgba(255,255,255,0.04)",
                    color: selected ? "#c4beff" : "#686888", border: `1px solid ${selected ? "rgba(123,111,245,0.45)" : "rgba(255,255,255,0.09)"}`,
                    boxShadow: selected ? "0 0 12px rgba(123,111,245,0.2)" : "none",
                  }}>
                    {interest.label}
                  </button>
                );
              })}
              {customInterests.map((interest) => (
                <div key={interest} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px 6px 14px", borderRadius: 20, background: "linear-gradient(130deg, rgba(91,138,240,0.22), rgba(123,111,245,0.18))", border: "1px solid rgba(91,138,240,0.35)" }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#a8c0f8" }}>{interest}</span>
                  <button onClick={() => removeCustomInterest(interest)} aria-label={`הסרת ${interest}`} style={{ background: "none", border: "none", color: "#506080", cursor: "pointer", lineHeight: 0, padding: 0 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))}
            </div>

            {showCustomInput ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 10, background: "rgba(91,138,240,0.07)", border: "1px solid rgba(91,138,240,0.22)", marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  autoFocus
                  aria-label="חיפוש או הוספת תחום עניין"
                  maxLength={80}
                  dir="auto"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addCustomInterest(); if (e.key === "Escape") setShowCustomInput(false); }}
                  placeholder="לדוגמה: OpenAI, רובוטיקה, SpaceX"
                  style={{ width: "100%", background: "transparent", border: "none", outline: "none", fontSize: "0.85rem", color: "#d0d0ee", fontFamily: "Heebo, sans-serif", caretColor: "#7b6ff5" }}
                />
                {interestResults.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {interestResults.map((item) => <button key={item.id} onClick={() => { setSelectedInterests((prev) => prev.includes(item.id) ? prev : [...prev, item.id]); setCustomInput(""); setShowCustomInput(false); setValidationAttempted(false); }} style={{ padding: "4px 8px", borderRadius: 8, background: "rgba(123,111,245,0.15)", color: "#b0a8ff", border: "1px solid rgba(123,111,245,0.3)", cursor: "pointer" }}><bdi dir="auto">{item.label}</bdi></button>)}
                </div>}
                </div>
                <button onClick={addCustomInterest} style={{ padding: "3px 12px", borderRadius: 7, background: "linear-gradient(130deg, #7b6ff5, #5b8af0)", border: "none", color: "#fff", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", fontFamily: "Heebo, sans-serif", flexShrink: 0 }}>הוספה</button>
                <button onClick={() => setShowCustomInput(false)} style={{ background: "none", border: "none", color: "#484868", cursor: "pointer", fontSize: "0.78rem", fontFamily: "Heebo, sans-serif", flexShrink: 0 }}>ביטול</button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: "0.75rem", color: "#484868" }}>לא מצאתם את מה שמעניין אתכם?</span>
                <button onClick={() => setShowCustomInput(true)} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, color: "#6868a0", fontFamily: "Heebo, sans-serif", padding: 0 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  הוספת תחום עניין
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "11px 14px", borderRadius: 12, background: "rgba(91,138,240,0.05)", border: "1px solid rgba(91,138,240,0.12)" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5b8af0" strokeWidth="2" strokeLinecap="round" style={{ marginTop: 2, flexShrink: 0 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          <p style={{ fontSize: "0.77rem", lineHeight: 1.6, color: "#606080", margin: 0 }}>ככל שנדע טוב יותר מה מעניין אתכם, נוכל לבחור עבורכם נושאים רלוונטיים יותר לפודקאסט.</p>
        </div>

        {continueError && <Notice tone="error">{continueError}</Notice>}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p
            role={validationAttempted ? "alert" : undefined}
            style={{
              margin: 0, textAlign: "center", fontSize: "0.76rem", lineHeight: 1.5,
              color: validationAttempted ? "#d98b8b" : "#666886",
              transition: "color 0.2s",
            }}
          >
            כדי להמשיך, יש להוסיף לפחות פריט אחד באחת מהאפשרויות בעמוד.
          </p>
          <button
            onClick={handleContinue}
            disabled={continueBusy}
            className="relative overflow-hidden group transition-all active:scale-[0.98]"
            style={{
              width: "100%", height: 52, borderRadius: 14, fontWeight: 700, fontSize: "0.92rem", fontFamily: "Heebo, sans-serif",
              background: !continueBusy ? "linear-gradient(130deg, #7b6ff5 0%, #6055e0 45%, #5b8af0 100%)" : "rgba(255,255,255,0.05)",
              color: !continueBusy ? "#fff" : "#404060",
              border: !continueBusy ? "none" : "1px solid rgba(255,255,255,0.08)",
              boxShadow: !continueBusy ? "0 2px 20px rgba(110,95,240,0.38), 0 1px 0 rgba(255,255,255,0.12) inset" : "none",
              cursor: !continueBusy ? "pointer" : "wait", transition: "all 0.25s",
            }}
          >
            <span className="relative">{continueBusy ? "בודקים…" : "המשך"}</span>
          </button>
          <button onClick={() => { saveDraft(); onBack(); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", color: "#505070", fontFamily: "Heebo, sans-serif", padding: "4px 0" }}>חזרה</button>
        </div>
      </div>
    </div>
  );
}

// ─── PortfolioConfirmScreen ───────────────────────────────────────────────────

interface ConfirmRow {
  id: string; kind: "asset" | "interest"; ticker: string; name: string; quantity: string; value: string; editing: boolean;
}

function PortfolioConfirmScreen({ holdings, interests, onNext, onBack }: { holdings: Holding[]; interests: string[]; onNext: (rows: Holding[], topics: string[]) => Promise<void>; onBack: (rows: Holding[], topics: string[]) => void }) {
  const seed: ConfirmRow[] = [
    ...holdings.map((h): ConfirmRow => ({ id: h.id, kind: "asset", ticker: h.ticker, name: h.name || h.ticker, quantity: h.quantity ?? "", value: h.avgCost ?? "", editing: false })),
    ...normalizeInterests(interests).map((name, i): ConfirmRow => ({ id: `interest-${i}`, kind: "interest", ticker: "", name, quantity: "", value: "", editing: false })),
  ];
  const [rows, setRows] = useState<ConfirmRow[]>(seed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function remove(id: string) { setRows((r) => r.filter((x) => x.id !== id)); }
  function toggleEdit(id: string) { setRows((r) => r.map((x) => (x.id === id ? { ...x, editing: !x.editing } : x))); }
  function updateField(id: string, field: "quantity" | "value" | "ticker" | "name", val: string) {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, [field]: val } : x)));
  }

  function confirmedData() {
    const assets = Array.from(new Map(rows.filter((row) => row.kind === "asset").map((r) => {
      const known = matchAsset(r.ticker, false) ?? matchAsset(r.name, false);
      const asset = { id: r.id, ticker: known?.ticker ?? r.ticker.trim().toUpperCase(), name: r.name.trim(), quantity: r.quantity, avgCost: r.value };
      return [conceptKey(asset.ticker), asset];
    })).values());
    const topics = normalizeInterests(rows.filter((row) => row.kind === "interest").map((row) => row.name))
      .filter((label) => !assets.some((asset) => conceptKey(asset.name) === conceptKey(label) || matchAsset(label, false)?.ticker === asset.ticker));
    return { assets, topics };
  }
  const canContinue = rows.length > 0 && rows.every((row) => row.name.trim() && (row.kind === "interest" || row.ticker.trim())) && !busy;
  const accentLine = <div style={{ height: 1, background: "linear-gradient(90deg, transparent 5%, #7b6ff5 38%, #5b8af0 62%, transparent 95%)" }} />;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden">
      <div className="absolute pointer-events-none" style={{ width: 620, height: 520, top: "44%", left: "50%", transform: "translate(-50%, -50%)", background: "radial-gradient(ellipse 55% 55% at 50% 48%, rgba(100,88,230,0.13) 0%, rgba(80,120,240,0.06) 50%, transparent 72%)" }} />

      <div className="relative z-10 w-full max-w-[540px]" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div dir="rtl" style={{ display: "flex", flexDirection: "column", gap: 6, textAlign: "right" }}>
          <h2 style={{ fontSize: "1.65rem", fontWeight: 700, color: "#eeeef2", letterSpacing: "-0.02em", margin: 0 }}>זה מה שהבנו שמעניין אתכם</h2>
          <p style={{ fontSize: "0.92rem", lineHeight: 1.6, color: "#a0a0bc", margin: 0 }}>בדקו שהנכסים והנושאים שזיהינו נכונים. כך <bdi dir="ltr">Vestory</bdi> ידע על מה לחפש ולהתמקד כשיכין עבורכם את הפודקאסט.</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((row) => {
            const initials = row.kind === "interest" ? "#" : row.ticker.replace(/[^A-Z]/g, "").slice(0, 2) || row.ticker.slice(0, 2).toUpperCase();
            return (
              <div key={row.id} style={{ borderRadius: 16, overflow: "hidden", background: "linear-gradient(155deg, rgba(26,26,40,0.97) 0%, rgba(18,18,30,0.98) 100%)", border: "1px solid rgba(123,111,245,0.18)", boxShadow: "0 0 0 1px rgba(255,255,255,0.03) inset, 0 4px 24px rgba(0,0,0,0.35)" }}>
                {accentLine}
                <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, direction: "rtl" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: "linear-gradient(135deg, rgba(123,111,245,0.22), rgba(91,138,240,0.16))", border: "1px solid rgba(123,111,245,0.22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#9d94f7", fontFamily: "JetBrains Mono, monospace", direction: "ltr" }}>{initials}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <bdi dir="auto" style={{ fontSize: "0.95rem", fontWeight: 700, color: "#dcdcee", overflowWrap: "anywhere" }}>{row.name}</bdi>
                      {row.kind === "asset" && row.ticker !== "?" && <bdi dir="ltr" style={{ fontSize: "0.7rem", fontWeight: 700, color: "#9d94f7", fontFamily: "JetBrains Mono, monospace", background: "rgba(123,111,245,0.12)", border: "1px solid rgba(123,111,245,0.22)", padding: "1px 7px", borderRadius: 6 }}>{row.ticker}</bdi>}
                    </div>
                    <span style={{ fontSize: "0.65rem", color: "#9090b0" }}>{row.kind === "asset" ? "נכס" : INTERESTS.some((item) => item.id === row.name) ? "תחום עניין" : "נושא אישי"}</span>
                    {(row.quantity || row.value) && !row.editing && (
                      <div style={{ display: "flex", gap: 12, marginTop: 3 }}>
                        {row.quantity && <span className="ph-mask-text" style={{ fontSize: "0.75rem", color: "#686888" }}>כמות: {row.quantity}</span>}
                        {row.value && <span className="ph-mask-text" style={{ fontSize: "0.75rem", color: "#686888" }}>שווי: {row.value}</span>}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <button aria-label={`${row.editing ? "סיום עריכת" : "עריכת"} ${row.name}`} onClick={() => toggleEdit(row.id)} style={{ padding: "4px 12px", borderRadius: 8, fontSize: "0.75rem", fontWeight: 600, background: row.editing ? "rgba(123,111,245,0.18)" : "rgba(255,255,255,0.05)", border: `1px solid ${row.editing ? "rgba(123,111,245,0.35)" : "rgba(255,255,255,0.1)"}`, color: row.editing ? "#9d94f7" : "#707090", cursor: "pointer", fontFamily: "Heebo, sans-serif" }}>
                      {row.editing ? "סיום" : "עריכה"}
                    </button>
                    <button aria-label={`הסרת ${row.name}`} onClick={() => remove(row.id)} style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.1)", color: "#583838", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                </div>

                {row.editing && (
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "12px 16px 14px", direction: "rtl" }}>
                    <p style={{ fontSize: "0.72rem", color: "#9090b0", marginBottom: 12 }}>{row.kind === "asset" ? "ניתן לתקן את שם הנכס, הסימבול, הכמות או השווי." : "ניתן לתקן את הנושא שמעניין אתכם."}</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                      {[
                        { label: row.kind === "asset" ? "שם הנכס" : "שם הנושא", field: "name" as const, placeholder: row.kind === "asset" ? "NVIDIA" : "נושא שמעניין אתכם", dir: "auto" },
                        { label: "סימבול", field: "ticker" as const, placeholder: "NVDA", dir: "ltr" },
                        { label: "כמות", field: "quantity" as const, placeholder: "10", dir: "ltr" },
                        { label: "שווי", field: "value" as const, placeholder: "₪20,000", dir: "ltr" },
                      ].filter(({ field }) => row.kind === "asset" || field === "name").map(({ label, field, placeholder, dir }) => (
                        <div key={field} style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}>
                          <label style={{ fontSize: "0.64rem", color: "#484868", display: "block", marginBottom: 4, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</label>
                          <input
                            aria-label={`${label} ${row.id}`}
                            maxLength={field === "name" ? row.kind === "interest" ? 80 : 100 : field === "ticker" ? 20 : 30}
                            dir={dir}
                            value={field === "ticker" ? row.ticker : field === "name" ? row.name : field === "quantity" ? row.quantity : row.value}
                            onChange={(e) => updateField(row.id, field, e.target.value)}
                            placeholder={placeholder}
                            style={{ width: "100%", background: "transparent", border: "none", outline: "none", fontSize: "0.85rem", color: "#d0d0e8", caretColor: "#7b6ff5", fontFamily: field === "ticker" ? "JetBrains Mono, monospace" : "Heebo, sans-serif" }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {rows.length === 0 && (
          <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.15)", textAlign: "center" }}>
            <p style={{ fontSize: "0.82rem", color: "#a07070", margin: 0 }}>כל הפריטים הוסרו — חזרו לעריכה כדי להוסיף נכסים או נושאים.</p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={async () => { const { assets, topics } = confirmedData(); setBusy(true); setError(""); try { await onNext(assets, topics); } catch (e) { setError(e instanceof Error ? e.message : "שמירת הפרופיל נכשלה."); } finally { setBusy(false); } }}
            disabled={!canContinue}
            className="relative overflow-hidden group transition-all active:scale-[0.98]"
            style={{
              width: "100%", height: 52, borderRadius: 14, fontWeight: 700, fontSize: "0.92rem", fontFamily: "Heebo, sans-serif",
              background: canContinue ? "linear-gradient(130deg, #7b6ff5 0%, #6055e0 45%, #5b8af0 100%)" : "rgba(255,255,255,0.05)",
              color: canContinue ? "#fff" : "#404060",
              border: canContinue ? "none" : "1px solid rgba(255,255,255,0.08)",
              boxShadow: canContinue ? "0 2px 20px rgba(110,95,240,0.38), 0 1px 0 rgba(255,255,255,0.12) inset" : "none",
              cursor: canContinue ? "pointer" : "not-allowed", transition: "all 0.25s",
            }}
          >
            <span className="relative">{busy ? "שומרים…" : "אישור והמשך"}</span>
          </button>
          {error && <Notice tone="error">{error}</Notice>}
          <button disabled={busy} onClick={() => { const { assets, topics } = confirmedData(); onBack(assets, topics); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", color: "#505070", fontFamily: "Heebo, sans-serif", padding: "4px 0" }}>חזרה לעריכה</button>
        </div>
      </div>
    </div>
  );
}

// ─── WatchlistScreen ──────────────────────────────────────────────────────────

// Kept temporarily for reference while the unchanged confirmation screen remains;
// the merged onboarding route no longer renders this former third screen.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function WatchlistScreen({ onNext, onBack }: { onNext: (watchlist: WatchItem[], interests: string[]) => Promise<void>; onBack: () => void }) {
  const [watchInput, setWatchInput] = useState("");
  const [watchFocused, setWatchFocused] = useState(false);
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [customInterests, setCustomInterests] = useState<string[]>([]);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const WATCH_SUGGESTIONS: Record<string, string> = {
    AAPL: "Apple Inc.", MSFT: "Microsoft Corp.", GOOGL: "Alphabet Inc.", AMZN: "Amazon.com Inc.",
    TSLA: "Tesla Inc.", META: "Meta Platforms", NVDA: "NVIDIA Corp.",
    "TASE:NICE": "נייס סיסטמס", "TASE:FIBI": "בנק הפועלים", BTC: "Bitcoin", ETH: "Ethereum", AMD: "AMD", INTC: "Intel Corp.",
  };

  const suggestions = watchInput.length > 0
    ? Object.entries(WATCH_SUGGESTIONS).filter(([t, n]) => t.toLowerCase().includes(watchInput.toLowerCase()) || n.toLowerCase().includes(watchInput.toLowerCase()))
    : [];

  function addWatch(ticker: string, name: string) {
    if (!watchlist.find((w) => w.ticker === ticker)) setWatchlist([...watchlist, { ticker, name }]);
    setWatchInput("");
  }
  function removeWatch(ticker: string) { setWatchlist(watchlist.filter((w) => w.ticker !== ticker)); }
  function toggleInterest(id: string) { setSelectedInterests((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id])); }
  function addCustom() {
    const v = customInput.trim();
    if (v && !customInterests.includes(v)) setCustomInterests((p) => [...p, v]);
    setCustomInput("");
    setShowCustomInput(false);
  }
  function removeCustom(v: string) { setCustomInterests((p) => p.filter((x) => x !== v)); }

  const hasInterest = selectedInterests.length > 0 || customInterests.length > 0;

  async function handleFinish() {
    setBusy(true);
    setError("");
    try {
      await onNext(watchlist, [...selectedInterests, ...customInterests]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "משהו השתבש. נסו שוב.");
      setBusy(false);
    }
  }

  const card: CSSProperties = {
    borderRadius: 18,
    background: "linear-gradient(155deg, rgba(26,26,40,0.97) 0%, rgba(18,18,30,0.98) 100%)",
    border: "1px solid rgba(123,111,245,0.16)",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.03) inset, 0 8px 40px rgba(0,0,0,0.38)",
    overflow: "hidden",
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden">
      <div className="absolute pointer-events-none" style={{ width: 700, height: 560, top: "45%", left: "50%", transform: "translate(-50%, -50%)", background: "radial-gradient(ellipse 55% 55% at 50% 48%, rgba(100,88,230,0.12) 0%, rgba(80,120,240,0.05) 50%, transparent 72%)" }} />

      <div className="relative z-10 w-full max-w-[560px]" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ height: 3, borderRadius: 99, width: i <= 2 ? 32 : 10, background: i <= 2 ? "linear-gradient(90deg, #7b6ff5, #5b8af0)" : "rgba(255,255,255,0.1)" }} />
            ))}
          </div>
          <span style={{ fontSize: 12, fontWeight: 500, color: "#7070a0" }}>שלב 2 מתוך 3</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h2 style={{ fontSize: "1.65rem", fontWeight: 700, color: "#eeeef2", letterSpacing: "-0.02em", margin: 0 }}>על מה עוד תרצו ש-VESTORY יעקוב?</h2>
          <p style={{ fontSize: "0.92rem", lineHeight: 1.6, color: "#a0a0bc", margin: 0 }}>הוסיפו נכסים ונושאים שמעניינים אתכם — גם אם הם לא נמצאים בתיק שלכם.</p>
        </div>

        <div style={card}>
          <div style={{ height: 1, background: "linear-gradient(90deg, transparent 5%, #7b6ff5 38%, #5b8af0 62%, transparent 95%)" }} />
          <div style={{ padding: "18px 20px 20px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#d0d0ea", margin: 0 }}>נכסים במעקב</h3>
              <span style={{ fontSize: "0.68rem", fontWeight: 600, color: "#505070", letterSpacing: "0.06em", textTransform: "uppercase", background: "rgba(255,255,255,0.05)", padding: "2px 8px", borderRadius: 5, border: "1px solid rgba(255,255,255,0.08)" }}>אופציונלי</span>
            </div>
            <p style={{ fontSize: "0.78rem", lineHeight: 1.6, color: "#686888", margin: "0 0 14px" }}>חברות, מניות, קרנות או נכסים שאתם רוצים להתעדכן לגביהם גם אם אינכם מחזיקים בהם כרגע.</p>

            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px", height: 42, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: `1px solid ${watchFocused ? "rgba(123,111,245,0.4)" : "rgba(255,255,255,0.1)"}`, transition: "border-color 0.2s" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#505070" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input
                  value={watchInput}
                  onChange={(e) => setWatchInput(e.target.value)}
                  onFocus={() => setWatchFocused(true)}
                  onBlur={() => setTimeout(() => setWatchFocused(false), 150)}
                  placeholder="חפשו נכס, חברה או סימבול — לדוגמה TSLA, META, BTC"
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: "0.85rem", color: "#d0d0ee", fontFamily: "Heebo, sans-serif", direction: "rtl", caretColor: "#7b6ff5" }}
                />
              </div>
              {suggestions.length > 0 && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 30, borderRadius: 12, overflow: "hidden", background: "rgba(22,22,36,0.98)", border: "1px solid rgba(123,111,245,0.22)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
                  {suggestions.map(([ticker, name]) => (
                    <button key={ticker} onMouseDown={() => addWatch(ticker, name)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "10px 14px", textAlign: "right", background: "none", border: "none", cursor: "pointer", fontFamily: "Heebo, sans-serif", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <span style={{ fontSize: "0.82rem", color: "#a0a0c0" }}>{name}</span>
                      <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#7b6ff5", fontFamily: "JetBrains Mono, monospace", direction: "ltr" }}>{ticker}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {watchlist.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {watchlist.map((w) => (
                  <div key={w.ticker} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px 5px 8px", borderRadius: 8, background: "rgba(123,111,245,0.13)", border: "1px solid rgba(123,111,245,0.25)" }}>
                    <div>
                      <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#9d94f7", fontFamily: "JetBrains Mono, monospace", direction: "ltr" }}>{w.ticker}</span>
                      <span style={{ fontSize: "0.72rem", color: "#707090", marginRight: 6 }}>{w.name}</span>
                    </div>
                    <button onClick={() => removeWatch(w.ticker)} style={{ background: "none", border: "none", color: "#505070", cursor: "pointer", lineHeight: 0, padding: 0 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={card}>
          <div style={{ height: 1, background: "linear-gradient(90deg, transparent 5%, #7b6ff5 38%, #5b8af0 62%, transparent 95%)" }} />
          <div style={{ padding: "18px 20px 20px" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#d0d0ea", margin: "0 0 6px" }}>תחומי עניין</h3>
            <p style={{ fontSize: "0.78rem", lineHeight: 1.6, color: "#686888", margin: "0 0 14px" }}>נושאים שתרצו לשמוע עליהם בפודקאסט גם כשהם לא קשורים ישירות לנכס בתיק.</p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
              {INTERESTS.map((interest) => {
                const sel = selectedInterests.includes(interest.id);
                return (
                  <button key={interest.id} onClick={() => toggleInterest(interest.id)} style={{
                    padding: "6px 14px", borderRadius: 20, fontSize: "0.82rem", fontWeight: sel ? 600 : 500, fontFamily: "Heebo, sans-serif", cursor: "pointer", transition: "all 0.18s",
                    background: sel ? "linear-gradient(130deg, rgba(123,111,245,0.28), rgba(91,138,240,0.22))" : "rgba(255,255,255,0.04)",
                    color: sel ? "#c4beff" : "#686888", border: `1px solid ${sel ? "rgba(123,111,245,0.45)" : "rgba(255,255,255,0.09)"}`,
                    boxShadow: sel ? "0 0 12px rgba(123,111,245,0.2)" : "none",
                  }}>
                    {interest.label}
                  </button>
                );
              })}
              {customInterests.map((ci) => (
                <div key={ci} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px 6px 14px", borderRadius: 20, background: "linear-gradient(130deg, rgba(91,138,240,0.22), rgba(123,111,245,0.18))", border: "1px solid rgba(91,138,240,0.35)" }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#a8c0f8" }}>{ci}</span>
                  <button onClick={() => removeCustom(ci)} style={{ background: "none", border: "none", color: "#506080", cursor: "pointer", lineHeight: 0, padding: 0 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))}
            </div>

            {!hasInterest && <p style={{ fontSize: "0.75rem", color: "#585878", marginBottom: 12, lineHeight: 1.5 }}>בחרו לפחות תחום עניין אחד כדי שנוכל להתאים את הפודקאסט גם למה שמעניין אתכם מעבר לתיק.</p>}

            {showCustomInput ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 10, background: "rgba(91,138,240,0.07)", border: "1px solid rgba(91,138,240,0.22)", marginBottom: 10 }}>
                <input
                  autoFocus
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addCustom(); if (e.key === "Escape") setShowCustomInput(false); }}
                  placeholder="לדוגמה: OpenAI, רובוטיקה, SpaceX"
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: "0.85rem", color: "#d0d0ee", fontFamily: "Heebo, sans-serif", direction: "rtl", caretColor: "#7b6ff5" }}
                />
                <button onClick={addCustom} style={{ padding: "3px 12px", borderRadius: 7, background: "linear-gradient(130deg, #7b6ff5, #5b8af0)", border: "none", color: "#fff", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", fontFamily: "Heebo, sans-serif", flexShrink: 0 }}>הוספה</button>
                <button onClick={() => setShowCustomInput(false)} style={{ background: "none", border: "none", color: "#484868", cursor: "pointer", fontSize: "0.78rem", fontFamily: "Heebo, sans-serif", flexShrink: 0 }}>ביטול</button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: "0.75rem", color: "#484868" }}>לא מצאתם את מה שמעניין אתכם?</span>
                <button onClick={() => setShowCustomInput(true)} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, color: "#6868a0", fontFamily: "Heebo, sans-serif", padding: 0 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  הוספת תחום עניין
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "11px 14px", borderRadius: 12, background: "rgba(91,138,240,0.05)", border: "1px solid rgba(91,138,240,0.12)" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5b8af0" strokeWidth="2" strokeLinecap="round" style={{ marginTop: 2, flexShrink: 0 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          <p style={{ fontSize: "0.77rem", lineHeight: 1.6, color: "#606080", margin: 0 }}>ככל שנדע טוב יותר מה מעניין אתכם, נוכל לבחור עבורכם נושאים רלוונטיים יותר לפודקאסט.</p>
        </div>

        {error && <Notice tone="error">{error}</Notice>}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={handleFinish}
            disabled={!hasInterest || busy}
            className="relative overflow-hidden group transition-all active:scale-[0.98]"
            style={{
              width: "100%", height: 52, borderRadius: 14, fontWeight: 700, fontSize: "0.92rem", fontFamily: "Heebo, sans-serif",
              background: hasInterest && !busy ? "linear-gradient(130deg, #7b6ff5 0%, #6055e0 45%, #5b8af0 100%)" : "rgba(255,255,255,0.05)",
              color: hasInterest && !busy ? "#fff" : "#404060",
              border: hasInterest && !busy ? "none" : "1px solid rgba(255,255,255,0.08)",
              boxShadow: hasInterest && !busy ? "0 2px 20px rgba(110,95,240,0.38), 0 1px 0 rgba(255,255,255,0.12) inset" : "none",
              cursor: hasInterest && !busy ? "pointer" : "not-allowed", transition: "all 0.25s",
            }}
          >
            <span className="relative">{busy ? "יוצרים…" : "יצירת הפודקאסט הראשון שלי"}</span>
          </button>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", color: "#505070", fontFamily: "Heebo, sans-serif", padding: "4px 0" }}>חזרה</button>
        </div>
      </div>
    </div>
  );
}

// ─── GeneratingScreen ─────────────────────────────────────────────────────────

function GeneratingScreen({ briefId, onDone, onBack }: { briefId: string; onDone: () => void; onBack: () => void }) {
  const [progress, setProgress] = useState(5);
  const [stageLabel, setStageLabel] = useState("מתחילים…");
  const [failed, setFailed] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    let timer: number;
    let stopped = false;
    const poll = async () => {
      try {
        const r = await fetch(`/api/briefs/${briefId}`, { cache: "no-store" });
        if (!r.ok) throw new Error("poll_failed");
        const b = (await r.json()) as { status: string; progress: number; stageLabel: string; errorMessage: string | null };
        if (stopped) return;
        setReconnecting(false);
        setProgress(b.progress);
        setStageLabel(b.stageLabel);
        if (b.status === "completed") { onDone(); return; }
        if (b.status === "failed") { setFailed(b.errorMessage || "יצירת הבריף נכשלה."); return; }
        timer = window.setTimeout(poll, 1200);
      } catch {
        if (!stopped) { setReconnecting(true); timer = window.setTimeout(poll, 2500); }
      }
    };
    void poll();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [briefId, onDone]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md flex flex-col items-center gap-10">
        <div className="relative w-24 h-24 flex items-center justify-center">
          <div
            className="absolute inset-0 rounded-full animate-spin-slow"
            style={{ background: "conic-gradient(from 0deg, #7b6ff5, #5b8af0, transparent)", WebkitMask: "radial-gradient(circle at center, transparent 38px, black 40px)", mask: "radial-gradient(circle at center, transparent 38px, black 40px)" }}
          />
          <Logo size="md" />
        </div>

        <div className="w-full text-center">
          <h2 className="text-xl font-bold mb-2" style={{ color: "#f7f7fb" }}>מכין את הפודקאסט שלך</h2>
          <p className="text-sm mb-6" style={{ color: "#9b9dae" }}>{reconnecting ? "מתחברים מחדש…" : stageLabel}</p>
          <div className="w-full h-1.5 rounded-full mb-6 overflow-hidden" style={{ background: "#181a26" }}>
            <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${progress}%`, background: "linear-gradient(90deg, #7b6ff5, #5b8af0)" }} />
          </div>
        </div>

        {failed ? (
          <>
            <Notice tone="error">{failed}</Notice>
            <button
              onClick={onBack}
              className="relative overflow-hidden group transition-all active:scale-[0.98]"
              style={{
                height: 44, padding: "0 24px", borderRadius: 12, fontWeight: 700, fontSize: "0.85rem", color: "#fff",
                background: "linear-gradient(130deg, #7b6ff5 0%, #6055e0 45%, #5b8af0 100%)", border: "none", cursor: "pointer",
              }}
            >
              חזרה ללוח היום
            </button>
          </>
        ) : (
          <small style={{ color: "#585878", fontSize: "0.75rem" }}>נכסי התיק ותחומי העניין נשלחים ל־OpenAI רק לצורך יצירת הבריף.</small>
        )}
      </div>
    </div>
  );
}

// ─── DashboardScreen ──────────────────────────────────────────────────────────

function DashboardScreen({ assets, brief, onNav, onPlay, onGenerate, generating, email, plan, onSignOut, canGenerate, preview, schedule }: {
  assets: Holding[]; brief: BriefView | null; onNav: (s: Screen) => void; onPlay: () => void; onGenerate: () => void; generating: boolean;
  email: string | null; plan: "daily" | "weekly"; onSignOut: () => void; canGenerate: boolean; preview: boolean;
  schedule: Parameters<typeof SchedulePanel>[0];
}) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const scheduleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scheduleOpen) return;
    function dismiss(event: MouseEvent) {
      if (scheduleRef.current && !scheduleRef.current.contains(event.target as Node)) setScheduleOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setScheduleOpen(false);
    }
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [scheduleOpen]);
  return <>
    <TodayDashboard assets={assets} brief={brief} email={email} plan={plan} onNav={onNav} onSignOut={onSignOut} onGenerate={onGenerate} generating={generating} canGenerate={canGenerate} preview={preview} onPreferences={() => setScheduleOpen(true)}
      player={<PlayerScreen key={brief?.id} brief={brief} onNav={onNav} embedded onOpenPlayer={onPlay}/>} />
    {scheduleOpen && <div ref={scheduleRef} style={{ position: "fixed", left: "max(12px, min(230px, calc(100vw - 332px)))", top: 80, width: "min(320px, calc(100vw - 24px))", maxHeight: "calc(100vh - 100px)", overflowY: "auto", zIndex: 60 }}>
      <button autoFocus aria-label="סגירת הגדרות פודקאסט" onClick={() => setScheduleOpen(false)} style={{ position: "absolute", left: 12, top: 12, zIndex: 61, color: "#9b9dae", background: "none", border: "none", cursor: "pointer" }}>✕</button>
      <SchedulePanel {...schedule} inline onSave={async (data) => { await schedule.onSave(data); setScheduleOpen(false); }} />
    </div>}
  </>;
}

// ─── PlayerScreen ─────────────────────────────────────────────────────────────

function PlayerScreen({ brief, onNav, autoplay = false, onAutoplayed, embedded = false, onOpenPlayer }: {
  brief: BriefView | null; onNav: (s: Screen) => void; autoplay?: boolean; onAutoplayed?: () => void; embedded?: boolean; onOpenPlayer?: () => void;
}) {
  const [playing, setPlaying] = useState(autoplay);
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  // Single source of truth for actually starting/stopping playback — the
  // `playing` state (toggled by the play/pause button and this screen's own
  // initial autoplay request) drives the real <audio> element here, instead
  // of each caller needing to imperatively call .play()/.pause() on the ref
  // itself. One <audio> element plays the whole episode end to end — chapter
  // navigation below only ever seeks within it, it never swaps the source.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) void el.play().catch(() => setPlaying(false));
    else el.pause();
  }, [playing]);

  useEffect(() => {
    if (autoplay) onAutoplayed?.();
    // Only meant to fire once, for the mount that requested it — not on every dependency change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!brief) return <div className="min-h-screen flex items-center justify-center" style={{ color: "#9b9dae" }}>הבריף לא נמצא.</div>;

  const totalDuration = brief.chapters.reduce((s, c) => s + (c.durationMs ?? 0), 0);
  const elapsedMs = elapsed * 1000;
  // The active chapter is derived from playback position within the single
  // continuous track, not stored separately — it's whichever chapter's
  // [startMs, startMs+durationMs) range contains the current time.
  const activeChapter = clamp(
    brief.chapters.reduce((found, c, i) => ((c.startMs ?? 0) <= elapsedMs ? i : found), 0),
    0,
    Math.max(0, brief.chapters.length - 1),
  );
  const chapter = brief.chapters[activeChapter];
  const progress = totalDuration ? elapsedMs / totalDuration : 0;

  function seekTo(seconds: number) {
    if (!audioRef.current) return;
    audioRef.current.currentTime = clamp(seconds, 0, totalDuration / 1000);
    setElapsed(audioRef.current.currentTime);
  }

  function seekToChapter(i: number) {
    const target = brief!.chapters[i];
    if (target) seekTo((target.startMs ?? 0) / 1000);
  }

  function seek(e: ReactMouseEvent<HTMLDivElement>) {
    if (!totalDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    seekTo(ratio * (totalDuration / 1000));
  }

  if (embedded) return <TodayPlayerCard brief={brief} audioRef={audioRef} playing={playing} elapsed={elapsed} totalDuration={totalDuration} progress={progress} activeChapter={activeChapter} speed={speed}
    onSpeed={setSpeed} onToggle={() => setPlaying((value) => !value)} onSeek={seekTo} onSeekChapter={seekToChapter}
    onAudioPlay={() => setPlaying(true)} onAudioPause={() => setPlaying(false)} onAudioTime={setElapsed} onAudioEnd={() => setPlaying(false)} onOpenPlayer={onOpenPlayer ?? (() => onNav("player"))}/>;

  return (
    <div className="min-h-screen pb-16">
      <div className="max-w-5xl mx-auto px-6 pt-8">
        <button onClick={() => onNav("dashboard")} className="flex items-center gap-1.5 text-sm mb-6 transition-colors hover:opacity-70" style={{ color: "#9b9dae", background: "none", border: "none", cursor: "pointer" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          חזרה ללוח היום
        </button>

        <div className="grid gap-8 responsive-aside-grid" style={{ gridTemplateColumns: "1fr 280px" }}>
          <div>
            <div className="mb-6">
              <h1 className="text-2xl font-bold" style={{ color: "#f7f7fb" }}>{brief.title || `הפודקאסט של ${new Date(brief.createdAt).toLocaleDateString("he-IL", { day: "numeric", month: "long" })}`}</h1>
              <p className="text-sm mt-1" style={{ color: "#9b9dae" }}><span style={{ direction: "rtl", unicodeBidi: "isolate" }}>{formatBriefTimestamp(brief.createdAt)}</span> · {formatSeconds(totalDuration / 1000)} · {brief.chapters.length} נושאים</p>
            </div>

            <div className="rounded-2xl p-6 mb-5 relative overflow-hidden" style={{ background: "#11131e", border: "1px solid #292c3d" }}>
              <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: "linear-gradient(90deg, #7b6ff5, #5b8af0)" }} />

              {brief.audioUrl && (
                <audio
                  ref={audioRef}
                  src={brief.audioUrl}
                  preload="auto"
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
                  onEnded={() => setPlaying(false)}
                />
              )}

              <div className="flex items-center gap-2 mb-4">
                <div className="px-2 py-0.5 rounded text-xs font-semibold" style={{ background: "rgba(123,111,245,0.15)", color: "#7b6ff5" }}>פרק {activeChapter + 1}</div>
                {playing && (
                  <div className="flex items-end gap-0.5 h-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="w-0.5 rounded-full" style={{ height: "100%", background: "#7b6ff5", animation: `waveform 0.8s ease-in-out ${i * 0.15}s infinite` }} />
                    ))}
                  </div>
                )}
              </div>
              <h2 className="text-lg font-semibold mb-6" style={{ color: "#f7f7fb" }}>{chapter?.title}</h2>

              <div className="rounded-lg overflow-hidden cursor-pointer relative" style={{ background: "#181a26", padding: 8, marginBottom: 8 }} onClick={seek}>
                <div className="flex items-end gap-px" style={{ height: 56, direction: "ltr" }}>
                  {Array.from({ length: 80 }).map((_, i) => {
                    const played = i / 80 < progress;
                    return <div key={i} className="flex-1 rounded-sm" style={{ height: `${25 + Math.sin(i * 0.35) * 20 + Math.abs(Math.sin(i * 0.8)) * 25}%`, background: played ? "linear-gradient(to top, #7b6ff5, #5b8af0)" : "#292c3d" }} />;
                  })}
                </div>
                {totalDuration > 0 && brief.chapters.slice(1).map((c) => (
                  <div
                    key={c.id}
                    title={c.title}
                    className="absolute rounded-full"
                    style={{
                      left: `calc(8px + (100% - 16px) * ${(c.startMs ?? 0) / totalDuration})`,
                      width: 6, height: 6, top: "50%", transform: "translate(-50%, -50%)",
                      background: "#f7f7fb", boxShadow: "0 0 0 2px #181a26", pointerEvents: "none",
                    }}
                  />
                ))}
              </div>

              <div className="flex items-center justify-between mb-5 text-xs font-mono" style={{ color: "#565968", direction: "ltr" }}>
                <span>{formatSeconds(elapsed)}</span>
                <span>{fmtMs(totalDuration)}</span>
              </div>

              <div className="flex items-center justify-between">
                <button onClick={() => setSpeed(speed === 1 ? 1.5 : speed === 1.5 ? 2 : speed === 2 ? 0.5 : 1)} className="px-2.5 py-1 rounded-md text-xs font-mono font-semibold transition-colors hover:bg-white/5" style={{ color: "#9b9dae", border: "1px solid #292c3d", background: "none", cursor: "pointer" }}>{speed}×</button>

                <div className="flex items-center gap-4">
                  <button onClick={() => activeChapter > 0 && seekToChapter(activeChapter - 1)} disabled={activeChapter === 0} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors" style={{ color: "#9b9dae", background: "none", border: "none", cursor: activeChapter === 0 ? "not-allowed" : "pointer", opacity: activeChapter === 0 ? 0.35 : 1 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4 19 20" /><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="2" fill="none" /></svg>
                  </button>
                  <button
                    onClick={() => setPlaying((p) => !p)}
                    disabled={!brief.audioUrl}
                    className="w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                    style={{ background: "linear-gradient(135deg, #7b6ff5, #5b8af0)", border: "none", cursor: brief.audioUrl ? "pointer" : "not-allowed", opacity: brief.audioUrl ? 1 : 0.4 }}
                  >
                    {playing ? (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                    )}
                  </button>
                  <button onClick={() => activeChapter < brief.chapters.length - 1 && seekToChapter(activeChapter + 1)} disabled={activeChapter === brief.chapters.length - 1} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors" style={{ color: "#9b9dae", background: "none", border: "none", cursor: activeChapter === brief.chapters.length - 1 ? "not-allowed" : "pointer", opacity: activeChapter === brief.chapters.length - 1 ? 0.35 : 1 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2" fill="none" /></svg>
                  </button>
                </div>

                <button onClick={() => onNav("sources")} className="px-2.5 py-1 rounded-md text-xs font-semibold transition-colors hover:bg-white/5" style={{ color: "#7b6ff5", border: "1px solid rgba(123,111,245,0.25)", background: "none", cursor: "pointer" }}>מקורות</button>
              </div>

              <p style={{ marginTop: 24, fontSize: "0.9rem", lineHeight: 1.85, color: "#c4c4d6", whiteSpace: "pre-wrap" }}>{chapter?.script}</p>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#565968" }}>פרקים</h3>
            <div className="space-y-1">
              {brief.chapters.map((ch, i) => {
                const isActive = i === activeChapter;
                const isDone = i < activeChapter;
                return (
                  <button key={ch.id} onClick={() => seekToChapter(i)} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-right" style={{ background: isActive ? "rgba(123,111,245,0.15)" : "transparent", border: `1px solid ${isActive ? "rgba(123,111,245,0.2)" : "transparent"}`, cursor: "pointer" }}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: isDone ? "rgba(52,211,153,0.15)" : isActive ? "rgba(123,111,245,0.15)" : "#181a26" }}>
                      {isDone ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                      ) : (
                        <span className="text-xs font-mono" style={{ color: isActive ? "#7b6ff5" : "#565968" }}>{ch.position ?? i + 1}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-right truncate" style={{ color: isActive ? "#7b6ff5" : isDone ? "#9b9dae" : "#f7f7fb" }}>{ch.title}</p>
                      <p className="text-xs font-mono mt-0.5" style={{ color: "#565968" }}>{fmtMs(ch.startMs)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SourcesScreen ────────────────────────────────────────────────────────────

function SourcesScreen({ brief, onNav }: { brief: BriefView | null; onNav: (s: Screen) => void }) {
  if (!brief) return <div className="min-h-screen flex items-center justify-center" style={{ color: "#9b9dae" }}>הבריף לא נמצא.</div>;

  const grouped = brief.chapters.map((ch) => ({ chapter: ch, sources: brief.sources.filter((s) => s.chapterId === ch.id) })).filter((g) => g.sources.length > 0);

  return (
    <div className="min-h-screen pb-16">
      <div className="max-w-3xl mx-auto px-6 pt-8">
        <button onClick={() => onNav("player")} className="flex items-center gap-1.5 text-sm mb-6 transition-colors hover:opacity-70" style={{ color: "#9b9dae", background: "none", border: "none", cursor: "pointer" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          חזרה לנגן
        </button>

        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: "#f7f7fb" }}>מקורות</h1>
          <p className="mt-1 text-sm" style={{ color: "#9b9dae" }}>כל הטענות בפודקאסט מגובות במקורות אלה</p>
        </div>

        {!grouped.length ? (
          <div className="rounded-2xl p-6 text-center" style={{ background: "#11131e", border: "1px solid #292c3d", color: "#9b9dae" }}>לא נמצאו מקורות עבור הבריף הזה.</div>
        ) : (
          <div className="space-y-8">
            {grouped.map(({ chapter, sources }) => (
              <div key={chapter.id}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono flex-shrink-0" style={{ background: "rgba(123,111,245,0.15)", color: "#7b6ff5" }}>{chapter.position}</div>
                  <h2 className="text-sm font-semibold" style={{ color: "#f7f7fb" }}>{chapter.title}</h2>
                </div>
                <div className="space-y-2 mr-9">
                  {sources.map((s) => (
                    <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-start justify-between p-4 rounded-xl transition-all hover:border-white/10 group block" style={{ background: "#11131e", border: "1px solid #292c3d" }}>
                      <div className="flex-1 min-w-0 ml-3">
                        <p className="text-sm font-medium leading-snug" style={{ color: "#f7f7fb" }}>{s.title}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {s.publisher && <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ background: "#181a26", color: "#9b9dae" }}>{s.publisher}</span>}
                        </div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 mt-0.5 opacity-30 group-hover:opacity-70 transition-opacity" style={{ color: "#f7f7fb" }}>
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PortfolioSettingsScreen ──────────────────────────────────────────────────


// ─── HistoryScreen ────────────────────────────────────────────────────────────
function PortfolioSettingsScreen({ holdings, interests, onSave, onNav, onSignOut, email, plan, schedule }: {
  holdings: Holding[]; interests: string[]; onSave: (h: Holding[], interests: string[]) => Promise<void>;
  onNav: (s: Screen) => void; onSignOut: () => void; email: string | null; plan: "daily" | "weekly";
  schedule: Parameters<typeof SchedulePanel>[0];
}) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  return <>
    <TrackingPage holdings={holdings} interests={interests} onSave={onSave} onNav={onNav} onSignOut={onSignOut} email={email} plan={plan} onPreferences={() => setScheduleOpen(true)}/>
    {scheduleOpen && <div style={{ position: "fixed", left: "max(12px, min(230px, calc(100vw - 332px)))", top: 80, width: "min(320px, calc(100vw - 24px))", maxHeight: "calc(100vh - 100px)", overflowY: "auto", zIndex: 60 }}>
      <button autoFocus aria-label="סגירת הגדרות פודקאסט" onClick={() => setScheduleOpen(false)} style={{ position: "absolute", left: 12, top: 12, zIndex: 61, color: "#9b9dae", background: "none", border: "none", cursor: "pointer" }}>✕</button>
      <SchedulePanel {...schedule} inline onSave={async (data) => { await schedule.onSave(data); setScheduleOpen(false); }}/>
    </div>}
  </>;
}

function weekBucket(d: Date) {
  const diff = Date.now() - d.getTime();
  if (diff < 7 * 86400000) return "השבוע";
  if (diff < 14 * 86400000) return "שבוע שעבר";
  return d.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
}

function HistoryScreen({ briefs, onOpen, onPlay }: { briefs: BriefView[]; onOpen: (id: string) => void; onPlay: (id: string) => void }) {
  const groups: { label: string; items: BriefView[] }[] = [];
  for (const b of briefs) {
    const label = weekBucket(new Date(b.createdAt));
    const existing = groups.find((g) => g.label === label);
    if (existing) existing.items.push(b);
    else groups.push({ label, items: [b] });
  }

  return (
    <div className="min-h-screen pb-16">
      <div className="max-w-3xl mx-auto px-6 pt-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: "#f7f7fb" }}>היסטוריית הפודקאסטים שלך</h1>
          <p className="mt-1 text-sm" style={{ color: "#9b9dae" }}>כאן אפשר לראות את כל הפודקאסטים הקודמים שנוצרו עבורך.</p>
        </div>

        {!briefs.length ? (
          <div className="rounded-2xl p-10 text-center" style={{ background: "#11131e", border: "1px solid #292c3d", color: "#9b9dae" }}>עדיין אין בריפים בארכיון.</div>
        ) : (
          <div className="space-y-8">
            {groups.map((group) => (
              <div key={group.label}>
                <p style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#565968", marginBottom: 10 }}>{group.label}</p>
                <div className="space-y-2">
                  {group.items.map((b) => {
                    const dur = b.chapters.reduce((s, c) => s + (c.durationMs ?? 0), 0);
                    return (
                      <div key={b.id} className="rounded-2xl overflow-hidden transition-all" style={{ background: "linear-gradient(155deg, rgba(22,22,34,0.98) 0%, rgba(16,16,28,0.99) 100%)", border: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 0 0 1px rgba(255,255,255,0.02) inset, 0 2px 12px rgba(0,0,0,0.3)" }}>
                        <div className="flex items-center gap-4 px-5 py-4" style={{ direction: "rtl" }}>
                          <button onClick={() => onPlay(b.id)} className="flex-shrink-0 transition-all hover:scale-105 active:scale-95" style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(123,111,245,0.13)", border: "1px solid rgba(123,111,245,0.25)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="#9d94f7" stroke="none"><polygon points="6 3 20 12 6 21 6 3" /></svg>
                          </button>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="font-semibold" style={{ fontSize: "0.92rem", color: "#f7f7fb", margin: 0 }}>{b.title || `הפודקאסט של ${new Date(b.createdAt).toLocaleDateString("he-IL", { day: "numeric", month: "long" })}`}</p>
                            <div className="flex items-center gap-2 mt-0.5" style={{ direction: "ltr", justifyContent: "flex-end" }}>
                              <span style={{ fontSize: "0.72rem", color: "#565968", direction: "rtl", unicodeBidi: "isolate" }}>{formatBriefTimestamp(b.createdAt)}</span>
                              <span style={{ fontSize: "0.65rem", color: "#565968" }}>·</span>
                              <span style={{ fontSize: "0.72rem", color: "#565968", fontFamily: "JetBrains Mono, monospace" }}>{formatSeconds(dur / 1000)}</span>
                              <span style={{ fontSize: "0.65rem", color: "#565968" }}>·</span>
                              <span style={{ fontSize: "0.72rem", color: "#565968" }}>{b.chapters.length} נושאים</span>
                            </div>
                          </div>
                          <button onClick={() => onOpen(b.id)} style={{ padding: "5px 14px", borderRadius: 8, flexShrink: 0, fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", fontFamily: "Heebo, sans-serif", background: "rgba(123,111,245,0.1)", border: "1px solid rgba(123,111,245,0.22)", color: "#7b6ff5" }}>
                            פתח פודקאסט
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── App shell ────────────────────────────────────────────────────────────────

type Profile = ProfileUpdate & { email: string | null; nextRunAt: string | null; lastScheduledAt: string | null };
const EMPTY_PROFILE: Profile = {
  email: null,
  targetMinutes: 5,
  podcastPlan: "daily",
  scheduleTime: "07:00",
  scheduleDay: null,
  scheduleTimezone: "Asia/Jerusalem",
  notifyByEmail: true,
  nextRunAt: null,
  lastScheduledAt: null,
  onboardingComplete: false,
  assets: [],
  interests: [],
};

function assetToHolding(a: Profile["assets"][number]): Holding {
  return { id: a.id ?? a.symbol, ticker: a.symbol, name: a.name, quantity: a.quantity ?? "", avgCost: a.averageCost ?? "" };
}

export function VestoryApp() {
  const [todayPreview, setTodayPreview] = useState(false);
  const [trackingPreview, setTrackingPreview] = useState(false);
  const [screen, setScreen] = useState<Screen>("welcome");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [briefs, setBriefs] = useState<BriefView[]>([]);
  const [activeBriefId, setActiveBriefId] = useState<string | null>(null);
  const [generateBriefId, setGenerateBriefId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [playOnEnter, setPlayOnEnter] = useState(false);

  const [onboardingHoldings, setOnboardingHoldings] = useState<Holding[]>([]);
  const [onboardingInterests, setOnboardingInterests] = useState<string[]>([]);
  const [onboardingSource, setOnboardingSource] = useState<string | null>(null);
  const [portfolioDraft, setPortfolioDraft] = useState<PortfolioDraft>({
    freeText: "",
    pickedAssets: [],
    confirmedScreenshot: false,
    detectedAssets: [],
    selectedInterests: [],
    customInterests: [],
  });

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const isLocalPreview = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const previewScreen = isLocalPreview ? query.get("preview") : null;

    if (previewScreen === "tracking" || previewScreen === "tracking-empty") {
      // Explicit localhost-only visual fixture; preview saves never touch Supabase.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTrackingPreview(true);
      setProfile({
        ...EMPTY_PROFILE, onboardingComplete: true,
        assets: previewScreen === "tracking-empty" ? [] : [
          {kind:"holding",symbol:"NVDA",name:"NVIDIA"}, {kind:"holding",symbol:"SPY",name:"S&P 500"},
          {kind:"holding",symbol:"BTC",name:"ביטקוין"}, {kind:"holding",symbol:"AAPL",name:"Apple"},
          {kind:"holding",symbol:"TASE:TEVA",name:"טבע"},
        ],
        interests: previewScreen === "tracking-empty" ? [] : ["AI","טכנולוגיה","קריפטו","כלכלת ישראל","שוק הנדל״ן","אנרגיה","ביוטק ופארמה"].map((label)=>({label})),
      });
      setScreen("settings-portfolio");
      setLoading(false);
      return;
    }

    if (previewScreen === "today" || previewScreen === "today-empty") {
      // Explicit localhost-only QA fixture; never used for signed-in production data.
      setTodayPreview(true);
      setProfile({ ...EMPTY_PROFILE, onboardingComplete: true, assets: [{ kind: "holding", symbol: "SPY", name: "S&P 500" }, { kind: "holding", symbol: "QQQ", name: "Nasdaq 100" }, { kind: "watchlist", symbol: "SPXL", name: "Direxion Daily S&P 500" }, { kind: "watchlist", symbol: "TQQQ", name: "ProShares UltraPro QQQ" }], interests: [{ label: "AI" }] });
      if (previewScreen === "today") {
        // Same-origin QA audio preserves the existing media-src security policy.
        const demo: BriefView = { id: "local-today-qa", title: "עדכון שוק שבועי: בינה מלאכותית, מניות ותשואות אג״ח", audioUrl: "/assets/local-today-qa.wav", status: "completed", progress: 100, stageLabel: "דוגמה מקומית", targetMinutes: 5, durationMs: 90000, errorMessage: null, createdAt: new Date().toISOString(), completedAt: new Date().toISOString(), sources: [], chapters: [{ id: "qa-ai", position: 0, title: "בינה מלאכותית: רגולציה ורכישה אפשרית", script: "", reasonKind: "interest", reasonLabel: "AI", durationMs: 52000, startMs: 0, audioUrl: null }, { id: "qa-market", position: 1, title: "מניות, תשואות ונפט", script: "", reasonKind: "portfolio", reasonLabel: "SPY", durationMs: 38000, startMs: 52000, audioUrl: null }] };
        setBriefs([demo]); setActiveBriefId(demo.id);
      }
      setScreen("dashboard"); setLoading(false); return;
    }

    if (previewScreen === "preferences" || previewScreen === "welcome" || previewScreen === "onboarding") {
      // Local-only preview routing intentionally initializes several related client states together.
      setProfile({ ...EMPTY_PROFILE, onboardingComplete: previewScreen === "preferences" });
      setScreen(previewScreen === "preferences" ? "settings-portfolio" : previewScreen === "onboarding" ? "portfolio-entry" : "welcome");
      setLoading(false);
      return;
    }

    initAnalytics();

    // Deep link from the "your podcast is ready" email (/vestory_app?brief=<id>).
    const linkedBriefId = query.get("brief");

    let ignore = false;
    Promise.all([
      fetch("/api/profile").then((r) => r.json() as Promise<Profile>),
      fetch("/api/briefs").then((r) => r.json() as Promise<BriefView[]>),
    ]).then(([p, b]) => {
      if (ignore) return;
      setProfile(p);
      setBriefs(b);
      if (linkedBriefId && b.some((brief) => brief.id === linkedBriefId)) {
        setActiveBriefId(linkedBriefId);
        setScreen("player");
        window.history.replaceState(null, "", "/vestory_app");
      } else {
        setScreen(p.onboardingComplete ? "dashboard" : "welcome");
      }
      if (p.email) identifyUser(p.email);
    }).catch(() => { if (!ignore) setLoadError("לא הצלחנו לטעון את הנתונים המקומיים."); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, []);

  function goTo(s: Screen) { setScreen(s); window.scrollTo(0, 0); }

  async function handleSignOut() {
    resetAnalytics();
    await fetch("/api/auth/sign-out", { method: "POST" });
    window.location.href = "/login";
  }

  function playBrief(id?: string) {
    if (id) setActiveBriefId(id);
    setPlayOnEnter(true);
    goTo("player");
  }

  async function persistProfile(next: Profile) {
    const r = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    if (!r.ok) throw new Error("שמירת הפרופיל נכשלה.");
    const saved = (await r.json()) as Profile;
    setProfile(saved);
    return saved;
  }

  async function refreshBriefs() {
    const r = await fetch("/api/briefs");
    const list = (await r.json()) as BriefView[];
    setBriefs(list);
    return list;
  }

  async function handleOnboardingComplete(holdings: Holding[], interests: string[]) {
    const holdingAssets: Profile["assets"] = holdings.filter((h) => h.ticker && h.ticker !== "?").map((h) => ({ kind: "holding", name: h.name, symbol: h.ticker, quantity: h.quantity || null, averageCost: h.avgCost || null }));
    const nextProfile: Profile = {
      ...profile,
      onboardingComplete: true,
      assets: holdingAssets,
      interests: interests.map((label) => ({ label, custom: !INTERESTS.some((i) => i.id === label) })),
    };
    await persistProfile(nextProfile);
    const r = await fetch("/api/briefs", { method: "POST" });
    const data = (await r.json()) as { id?: string; error?: string };
    if (!r.ok || !data.id) throw new Error("לא הצלחנו להתחיל ביצירת הבריף.");
    setGenerateBriefId(data.id);
    goTo("generating");
  }

  async function handleGenerateFromDashboard() {
    setGenerating(true);
    try {
      const r = await fetch("/api/briefs", { method: "POST" });
      const data = (await r.json()) as { id?: string };
      if (!r.ok || !data.id) throw new Error("failed");
      setGenerateBriefId(data.id);
      goTo("generating");
    } finally {
      setGenerating(false);
    }
  }

  async function handleGeneratingDone() {
    const list = await refreshBriefs();
    setActiveBriefId(list[0]?.id ?? null);
    goTo("dashboard");
  }

  async function handleSaveHoldings(rows: Holding[], interests: string[]) {
    const watchlistAssets = profile.assets.filter((a) => a.kind === "watchlist");
    const holdingAssets: Profile["assets"] = rows.map((h) => ({ kind: "holding", name: h.name || h.ticker, symbol: h.ticker, quantity: h.quantity || null, averageCost: h.avgCost || null }));
    const updated = {
      ...profile,
      assets: [...holdingAssets, ...watchlistAssets],
      interests: interests.map((label) => ({ label, custom: !INTERESTS.some((i) => i.id === label) })),
    };
    if (trackingPreview) setProfile(updated);
    else await persistProfile(updated);
  }

  async function handleSaveSchedule(data: {
    podcastPlan: "daily" | "weekly"; scheduleTime: string; scheduleDay: number | null; notifyByEmail: boolean;
  }) {
    const updated: Profile = {
      ...profile,
      targetMinutes: targetMinutesForPlan(data.podcastPlan),
      podcastPlan: data.podcastPlan,
      scheduleTime: data.scheduleTime,
      scheduleDay: data.scheduleDay,
      scheduleTimezone: "Asia/Jerusalem",
      notifyByEmail: data.notifyByEmail,
    };
    if (trackingPreview) setProfile(updated);
    else await persistProfile(updated);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="animate-spin-slow rounded-full" style={{ width: 40, height: 40, background: "conic-gradient(from 0deg, #7b6ff5, #5b8af0, transparent)", WebkitMask: "radial-gradient(circle at center, transparent 14px, black 16px)", mask: "radial-gradient(circle at center, transparent 14px, black 16px)" }} />
        <p style={{ color: "#8a8aaa" }}>טוענים את VESTORY…</p>
      </div>
    );
  }

  const holdings = profile.assets.filter((a) => a.kind === "holding").map(assetToHolding);
  const activeBrief = briefs.find((b) => b.id === activeBriefId) ?? briefs[0] ?? null;

  const topBarScreens: Screen[] = ["dashboard", "player", "sources", "settings-portfolio", "history"];

  return (
    <div className="vestory-ui" style={{ minHeight: "100%", background: "#080910" }}>
      {screen !== "dashboard" && screen !== "settings-portfolio" && <TopBar
        onNav={goTo}
        screen={screen}
        onSignOut={() => void handleSignOut()}
        podcastPlan={profile.podcastPlan}
        scheduleTime={profile.scheduleTime}
        scheduleDay={profile.scheduleDay}
        nextRunAt={profile.nextRunAt}
        notifyByEmail={profile.notifyByEmail}
        onSaveSchedule={handleSaveSchedule}
      />}
      {!topBarScreens.includes(screen) && (
        <button
          onClick={() => void handleSignOut()}
          className="fixed top-4 left-4 z-50 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-white/5"
          style={{ color: "#565968", border: "1px solid #292c3d", background: "rgba(9,10,17,0.7)", backdropFilter: "blur(8px)", cursor: "pointer" }}
        >
          התנתקות
        </button>
      )}
      {loadError && <div className="max-w-5xl mx-auto px-6 pt-4"><Notice tone="error">{loadError}</Notice></div>}

      {screen === "welcome" && <WelcomeScreen onNext={() => goTo("portfolio-entry")} />}

      {screen === "portfolio-entry" && (
        <PortfolioEntryScreen
          draft={portfolioDraft}
          onDraftChange={setPortfolioDraft}
          onNext={async (holdings, interests, source) => {
            // Keep corrections after back/forward if the source inputs have not changed.
            if (source !== onboardingSource) {
              setOnboardingHoldings(holdings);
              setOnboardingInterests(interests);
              setOnboardingSource(source);
            }
            goTo("portfolio-confirm");
          }}
          onBack={() => goTo("welcome")}
        />
      )}

      {screen === "portfolio-confirm" && (
        <PortfolioConfirmScreen
          holdings={onboardingHoldings}
          interests={onboardingInterests}
          onNext={async (rows, topics) => {
            setOnboardingHoldings(rows);
            setOnboardingInterests(topics);
            await handleOnboardingComplete(rows, topics);
          }}
          onBack={(rows, topics) => { setOnboardingHoldings(rows); setOnboardingInterests(topics); goTo("portfolio-entry"); }}
        />
      )}

      {screen === "generating" && generateBriefId && <GeneratingScreen briefId={generateBriefId} onDone={() => void handleGeneratingDone()} onBack={() => goTo("dashboard")} />}

      {screen === "dashboard" && (
        <DashboardScreen assets={profile.assets.map(assetToHolding)} brief={activeBrief} onNav={goTo} onPlay={playBrief} onGenerate={() => void handleGenerateFromDashboard()} generating={generating} email={profile.email} plan={profile.podcastPlan} onSignOut={() => void handleSignOut()} canGenerate={profile.assets.length > 0 || profile.interests.length > 0} preview={todayPreview} schedule={{ podcastPlan: profile.podcastPlan, scheduleTime: profile.scheduleTime, scheduleDay: profile.scheduleDay, nextRunAt: profile.nextRunAt, notifyByEmail: profile.notifyByEmail, onSave: handleSaveSchedule }} />
      )}
      {screen === "player" && (
        <PlayerScreen brief={activeBrief} onNav={goTo} autoplay={playOnEnter} onAutoplayed={() => setPlayOnEnter(false)} />
      )}
      {screen === "sources" && <SourcesScreen brief={activeBrief} onNav={goTo} />}
      {screen === "settings-portfolio" && (
        <PortfolioSettingsScreen
          holdings={holdings}
          interests={profile.interests.map((i) => i.label)}
          onSave={handleSaveHoldings}
          onNav={goTo}
          onSignOut={() => void handleSignOut()}
          email={profile.email}
          plan={profile.podcastPlan}
          schedule={{ podcastPlan: profile.podcastPlan, scheduleTime: profile.scheduleTime, scheduleDay: profile.scheduleDay, nextRunAt: profile.nextRunAt, notifyByEmail: profile.notifyByEmail, onSave: handleSaveSchedule }}
        />
      )}
      {screen === "history" && (
        <HistoryScreen briefs={briefs} onOpen={(id) => { setActiveBriefId(id); goTo("player"); }} onPlay={(id) => playBrief(id)} />
      )}
      <div className={screen === "dashboard" || screen === "settings-portfolio" ? "today-legal-footer" : undefined}><LegalFooter /></div>
    </div>
  );
}

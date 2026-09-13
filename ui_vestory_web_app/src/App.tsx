import { useState, useEffect, useRef } from "react";
import slinonLogo from "@/imports/ChatGPT_Image_Sep_9__2026__07_35_22_PM.png";

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen =
  | "welcome"
  | "portfolio-entry"
  | "portfolio-confirm"
  | "watchlist"
  | "generating"
  | "dashboard"
  | "player"
  | "sources"
  | "settings-portfolio"
  | "settings-personalization"
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

const MARKET_DATA: Record<string, { change: number; price: number }> = {
  AAPL: { change: 1.23, price: 189.42 },
  MSFT: { change: -0.54, price: 415.78 },
  GOOGL: { change: 2.1, price: 171.55 },
  AMZN: { change: 0.87, price: 198.33 },
  TSLA: { change: -3.2, price: 242.1 },
  META: { change: 1.65, price: 512.44 },
  NVDA: { change: 4.3, price: 875.2 },
  "TASE:NICE": { change: 0.9, price: 83.4 },
  "TASE:FIBI": { change: -0.3, price: 41.2 },
};

const INTERESTS = [
  { id: "tech", label: "טכנולוגיה" },
  { id: "ai", label: "AI" },
  { id: "crypto", label: "קריפטו" },
  { id: "rates", label: "ריבית ואינפלציה" },
  { id: "israel", label: "כלכלת ישראל" },
  { id: "global", label: "כלכלה עולמית" },
  { id: "realestate", label: "שוק הנדל״ן" },
  { id: "energy", label: "אנרגיה" },
  { id: "fx", label: "מט\"ח" },
  { id: "bonds", label: "אג\"ח" },
  { id: "biotech", label: "ביוטק ופארמה" },
  { id: "chips", label: "שבבים" },
];

const BRIEF_CHAPTERS = [
  { id: 1, title: "סקירת בוקר", time: "0:00", duration: 58 },
  { id: 2, title: "NVIDIA — מה קרה ומה זה אומר עבורך", time: "0:58", duration: 88 },
  { id: 3, title: "חדשות משמעותיות בעולם הטכנולוגיה", time: "2:26", duration: 74 },
  { id: 4, title: "אירוע שוק שמשפיע על מניות טכנולוגיה", time: "3:40", duration: 66 },
  { id: 5, title: "מה לצפות היום", time: "4:46", duration: 48 },
];

const SOURCES = [
  { id: 1, chapter: "NVIDIA — מה קרה ומה זה אומר עבורך", title: "NVIDIA Reports Record Data Center Revenue, Beats Estimates", outlet: "Bloomberg", time: "לפני 3 שעות", url: "#" },
  { id: 2, chapter: "NVIDIA — מה קרה ומה זה אומר עבורך", title: "Jensen Huang: 'Demand for Blackwell far exceeds supply'", outlet: "Reuters", time: "לפני 4 שעות", url: "#" },
  { id: 3, chapter: "חדשות משמעותיות בעולם הטכנולוגיה", title: "AI Chip Demand Surges as Tech Giants Race to Deploy Infrastructure", outlet: "FT", time: "לפני 5 שעות", url: "#" },
  { id: 4, chapter: "חדשות משמעותיות בעולם הטכנולוגיה", title: "מגמות AI בשוק הישראלי: חברות הייטק מגדילות השקעות", outlet: "כלכליסט", time: "לפני 6 שעות", url: "#" },
  { id: 5, chapter: "אירוע שוק שמשפיע על מניות טכנולוגיה", title: "Tech Sector Volatility: What Rising Rates Mean for Growth Stocks", outlet: "WSJ", time: "לפני 7 שעות", url: "#" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSeconds(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

// ─── Small shared components ──────────────────────────────────────────────────

function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const w = size === "sm" ? 58 : size === "lg" ? 110 : 80;
  return (
    <div style={{ isolation: "isolate", display: "flex", alignItems: "center", flexShrink: 0 }}>
      <img src={slinonLogo} alt="slinon" style={{ width: w, height: "auto", mixBlendMode: "screen", opacity: 0.92 }} />
    </div>
  );
}

function TopBar({ onNav, screen }: { onNav: (s: Screen) => void; screen: Screen }) {
  const showNav = ["dashboard", "player", "sources", "settings-portfolio", "settings-personalization", "history"].includes(screen);
  if (!showNav) return null;
  return (
    <header className="glass border-b sticky top-0 z-50" style={{ borderColor: "var(--color-border)" }}>
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <button onClick={() => onNav("dashboard")} className="flex items-center gap-2.5 group">
          <Logo size="sm" />
          <span className="font-bold text-sm" style={{ color: "var(--color-text)" }}>VESTORY</span>
        </button>
        <nav className="flex items-center gap-1">
          {[
            { id: "dashboard" as Screen, label: "היום" },
            { id: "settings-portfolio" as Screen, label: "תיק" },
            { id: "settings-personalization" as Screen, label: "העדפות" },
            { id: "history" as Screen, label: "היסטוריה" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              className="px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: screen === item.id ? "var(--color-accent-dim)" : "transparent",
                color: screen === item.id ? "var(--color-accent)" : "var(--color-text-secondary)",
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

// ─── Screens ──────────────────────────────────────────────────────────────────

function WelcomeScreen({ onNext }: { onNext: () => void }) {
  const benefits = [
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
      ),
      title: "מותאם אליך",
      desc: "לפי תיק ההשקעות, הנכסים שעוקבים אחריהם והתחומים שמעניינים אותך.",
    },
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
      ),
      title: "חוסך לך זמן",
      desc: "במקום לעבור על חדשות ופודקאסטים — רק מה שבאמת חשוב לך.",
    },
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
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

      {/* ── Background lighting ── */}
      {/* Dense hero glow — strong but contained to upper half */}
      <div className="absolute pointer-events-none" style={{
        width: 800, height: 600,
        top: -160, left: "50%", transform: "translateX(-50%)",
        background: "radial-gradient(ellipse 60% 55% at 50% 35%, rgba(105,90,230,0.22) 0%, rgba(80,120,240,0.10) 50%, transparent 75%)",
      }} />
      {/* Secondary blue orb — lower left, subtle */}
      <div className="absolute pointer-events-none" style={{
        width: 500, height: 400,
        bottom: 120, left: -100,
        background: "radial-gradient(ellipse, rgba(91,138,240,0.09) 0%, transparent 65%)",
      }} />
      {/* Faint purple orb — lower right */}
      <div className="absolute pointer-events-none" style={{
        width: 380, height: 300,
        bottom: 60, right: -80,
        background: "radial-gradient(ellipse, rgba(123,111,245,0.07) 0%, transparent 65%)",
      }} />

      {/* ── Content column ── */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-[500px] text-center animate-fade-up" style={{ gap: "1.5rem" }}>

        {/* ── Brand header ── */}
        {/* Slinon logo — screen blend: black pixels become transparent against the dark bg */}
        <div className="flex flex-col items-center" style={{ gap: "0.5rem", isolation: "isolate" }}>
          <img
            src={slinonLogo}
            alt="Slinon"
            style={{ width: 160, height: "auto", mixBlendMode: "screen", opacity: 0.97, display: "block" }}
          />
        </div>

        {/* ── Hero copy ── */}
        <div className="flex flex-col items-center" style={{ gap: "0.75rem" }}>
          <h1
            style={{
              fontSize: "clamp(2.75rem, 7vw, 3.75rem)",
              fontWeight: 800,
              letterSpacing: "-0.025em",
              lineHeight: 1,
              background: "linear-gradient(145deg, #f0f0f5 20%, #c4bdff 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            VESTORY
          </h1>
          <p style={{
            fontSize: "1.05rem",
            fontWeight: 500,
            lineHeight: 1.5,
            color: "#c8c8de",
            maxWidth: 380,
          }}>
            כל מה שחשוב להשקעות שלך — ב־3-10 דקות
          </p>
          <p style={{
            fontSize: "0.85rem",
            lineHeight: 1.65,
            color: "#8a8aaa",
            maxWidth: 400,
          }}>
            VESTORY מסנן עבורך את חדשות השוק ומסביר מה התרחש, מדוע זה חשוב לתיק שלך ולנושאים שמעניינים אותך — בפודקאסט אישי בעברית.
          </p>
        </div>

        {/* ── CTA ── above fold, before preview ── */}
        <button
          onClick={onNext}
          className="w-full relative overflow-hidden group transition-all active:scale-[0.98]"
          style={{
            height: 52,
            borderRadius: 14,
            fontWeight: 700,
            fontSize: "0.9rem",
            color: "#fff",
            background: "linear-gradient(130deg, #7b6ff5 0%, #6055e0 45%, #5b8af0 100%)",
            boxShadow: "0 2px 20px rgba(110,95,240,0.45), 0 1px 0 rgba(255,255,255,0.14) inset",
          }}
        >
          <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-[14px]"
            style={{ background: "linear-gradient(130deg, rgba(255,255,255,0.09) 0%, transparent 60%)" }} />
          <span className="relative">יצירת הפודקאסט הראשון שלי ←</span>
        </button>

        {/* ── Product preview card ── */}
        <div
          className="w-full rounded-2xl text-right overflow-hidden"
          style={{
            background: "linear-gradient(155deg, rgba(28,28,40,0.96) 0%, rgba(18,18,28,0.98) 100%)",
            border: "1px solid rgba(123,111,245,0.18)",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.035) inset, 0 12px 48px rgba(0,0,0,0.5), 0 0 40px rgba(100,90,230,0.09)",
          }}
        >
          {/* Accent top line */}
          <div style={{ height: 1, background: "linear-gradient(90deg, transparent 5%, #7b6ff5 38%, #5b8af0 62%, transparent 95%)" }} />

          <div style={{ padding: "16px 20px 18px" }}>
            {/* Header row — RTL: title/meta on RIGHT, play+time on LEFT */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, direction: "rtl" }}>
              {/* Title + meta — RIGHT (first in RTL) */}
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#d0d0e8" }}>הפודקאסט של היום</p>
                <p style={{ fontSize: 11, color: "#6a6a88", marginTop: 1 }}>4 נושאים • מותאם אישית</p>
              </div>
              {/* Play button + time — LEFT (second in RTL) */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, direction: "ltr" }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: "linear-gradient(135deg, rgba(123,111,245,0.3), rgba(91,138,240,0.25))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: "1px solid rgba(123,111,245,0.2)",
                }}>
                  <svg width="9" height="10" viewBox="0 0 9 10" fill="none">
                    <path d="M1 1.5L8 5L1 8.5V1.5Z" fill="#9d94f7" stroke="#9d94f7" strokeWidth="0.5" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(155,148,230,0.7)", fontVariantNumeric: "tabular-nums" }}>
                  6:24
                </span>
              </div>
            </div>

            {/* Slim waveform — LTR: played (purple) on LEFT, unplayed on RIGHT */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 20, marginBottom: 14, opacity: 0.45, direction: "ltr" }}>
              {Array.from({ length: 52 }).map((_, i) => (
                <div key={i} style={{
                  flex: 1, borderRadius: 99,
                  height: `${20 + Math.sin(i * 0.5) * 14 + Math.abs(Math.sin(i * 0.9)) * 22}%`,
                  background: i < 14
                    ? "linear-gradient(to top, #7b6ff5, #7bb3f5)"
                    : "rgba(255,255,255,0.09)",
                }} />
              ))}
            </div>

            {/* Topics — RTL: bullet on RIGHT, text flows left */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, direction: "rtl" }}>
              {previewTopics.map((t) => (
                <div key={t.label} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%", flexShrink: 0, marginTop: 5,
                    background: t.color, boxShadow: `0 0 6px ${t.color}55`,
                  }} />
                  <span style={{ fontSize: "0.78rem", lineHeight: 1.45, color: "#b0b0cc", textAlign: "right" }}>{t.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Benefit cards ── below fold is fine ── */}
        <div className="w-full grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          {benefits.map((b) => (
            <div
              key={b.title}
              className="flex flex-col text-right"
              style={{
                gap: 8,
                padding: "13px 13px 14px",
                borderRadius: 14,
                background: "rgba(24,24,34,0.75)",
                border: "1px solid rgba(255,255,255,0.07)",
                backdropFilter: "blur(10px)",
              }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: "rgba(123,111,245,0.14)",
                color: "#a099f5",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginLeft: "auto",
                border: "1px solid rgba(123,111,245,0.16)",
              }}>
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

const POPULAR_ASSETS: { ticker: string; name: string; nameHe?: string; secNum?: string }[] = [
  { ticker: "NVDA",  name: "NVIDIA",           nameHe: "אנבידיה" },
  { ticker: "AAPL",  name: "Apple",            nameHe: "אפל" },
  { ticker: "MSFT",  name: "Microsoft",        nameHe: "מיקרוסופט" },
  { ticker: "TSLA",  name: "Tesla",            nameHe: "טסלה" },
  { ticker: "META",  name: "Meta",             nameHe: "מטא" },
  { ticker: "AMZN",  name: "Amazon",           nameHe: "אמזון" },
  { ticker: "GOOGL", name: "Alphabet (Google)", nameHe: "אלפבית" },
  { ticker: "AMD",   name: "AMD" },
  { ticker: "INTC",  name: "Intel",            nameHe: "אינטל" },
  { ticker: "NFLX",  name: "Netflix",          nameHe: "נטפליקס" },
  { ticker: "ORCL",  name: "Oracle" },
  { ticker: "CRM",   name: "Salesforce" },
  { ticker: "ADBE",  name: "Adobe" },
  { ticker: "PYPL",  name: "PayPal" },
  { ticker: "SQ",    name: "Block (Square)" },
  { ticker: "SHOP",  name: "Shopify" },
  { ticker: "UBER",  name: "Uber" },
  { ticker: "LYFT",  name: "Lyft" },
  { ticker: "SNAP",  name: "Snap" },
  { ticker: "TWTR",  name: "X (Twitter)" },
  { ticker: "SPOT",  name: "Spotify" },
  { ticker: "COIN",  name: "Coinbase" },
  { ticker: "HOOD",  name: "Robinhood" },
  { ticker: "PLTR",  name: "Palantir" },
  { ticker: "AI",    name: "C3.ai" },
  { ticker: "SMCI",  name: "Super Micro" },
  { ticker: "ARM",   name: "ARM Holdings" },
  { ticker: "AVGO",  name: "Broadcom" },
  { ticker: "QCOM",  name: "Qualcomm" },
  { ticker: "TXN",   name: "Texas Instruments" },
  { ticker: "MU",    name: "Micron Technology" },
  { ticker: "WMT",   name: "Walmart" },
  { ticker: "TGT",   name: "Target" },
  { ticker: "COST",  name: "Costco" },
  { ticker: "HD",    name: "Home Depot" },
  { ticker: "NKE",   name: "Nike" },
  { ticker: "MCD",   name: "McDonald's" },
  { ticker: "SBUX",  name: "Starbucks" },
  { ticker: "DIS",   name: "Disney" },
  { ticker: "NFLX",  name: "Netflix" },
  { ticker: "BA",    name: "Boeing" },
  { ticker: "GE",    name: "GE Aerospace" },
  { ticker: "CAT",   name: "Caterpillar" },
  { ticker: "DE",    name: "John Deere" },
  { ticker: "F",     name: "Ford" },
  { ticker: "GM",    name: "General Motors" },
  { ticker: "RIVN",  name: "Rivian" },
  { ticker: "JPM",   name: "JPMorgan Chase" },
  { ticker: "GS",    name: "Goldman Sachs" },
  { ticker: "MS",    name: "Morgan Stanley" },
  { ticker: "BAC",   name: "Bank of America" },
  { ticker: "C",     name: "Citigroup" },
  { ticker: "WFC",   name: "Wells Fargo" },
  { ticker: "V",     name: "Visa" },
  { ticker: "MA",    name: "Mastercard" },
  { ticker: "BRK.B", name: "Berkshire Hathaway" },
  { ticker: "JNJ",   name: "Johnson & Johnson" },
  { ticker: "PFE",   name: "Pfizer" },
  { ticker: "MRNA",  name: "Moderna" },
  { ticker: "ABBV",  name: "AbbVie" },
  { ticker: "LLY",   name: "Eli Lilly" },
  { ticker: "UNH",   name: "UnitedHealth" },
  { ticker: "CVS",   name: "CVS Health" },
  { ticker: "XOM",   name: "ExxonMobil" },
  { ticker: "CVX",   name: "Chevron" },
  { ticker: "NEE",   name: "NextEra Energy" },
  { ticker: "T",     name: "AT&T" },
  { ticker: "VZ",    name: "Verizon" },
  { ticker: "SPY",   name: "S&P 500 ETF (SPY)" },
  { ticker: "QQQ",   name: "Nasdaq 100 ETF (QQQ)" },
  { ticker: "VOO",   name: "Vanguard S&P 500 (VOO)" },
  { ticker: "IVV",   name: "iShares Core S&P 500 (IVV)" },
  { ticker: "VTI",   name: "Vanguard Total Market (VTI)" },
  { ticker: "BTC",   name: "Bitcoin",          nameHe: "ביטקוין" },
  { ticker: "ETH",   name: "Ethereum",         nameHe: "אתריום" },
  { ticker: "SOL",   name: "Solana" },
  { ticker: "XRP",   name: "XRP" },
  { ticker: "DOGE",  name: "Dogecoin" },
  { ticker: "TASE:NICE",  name: "Nice Systems",     nameHe: "נייס סיסטמס",     secNum: "1122127" },
  { ticker: "TASE:FIBI",  name: "First International Bank", nameHe: "בנק הפועלים הבינלאומי", secNum: "604611" },
  { ticker: "TASE:TEVA",  name: "Teva",             nameHe: "טבע",             secNum: "1120300" },
  { ticker: "TASE:CHKP",  name: "Check Point",      nameHe: "צ'ק פוינט",       secNum: "1084761" },
  { ticker: "TASE:WIXL",  name: "Wix",              nameHe: "ויקס",            secNum: "1141783" },
  { ticker: "TASE:MNDY",  name: "Monday.com",       nameHe: "מאנדיי",          secNum: "1201605" },
  { ticker: "TASE:GILT",  name: "Gilat Satellite",  nameHe: "גילת לווין" },
  { ticker: "TASE:SNE",   name: "Sano Genetics",    nameHe: "סאנו" },
  { ticker: "TASE:MLTM",  name: "Malam Team",       nameHe: "מלם-תים" },
];

const INITIAL_POPULAR = POPULAR_ASSETS.slice(0, 6);

// ─── Asset lookup + free-text parser ─────────────────────────────────────────

// Build lookup from POPULAR_ASSETS + extra Hebrew variants / typos
const ASSET_LOOKUP: Record<string, { ticker: string; name: string }> = {};

POPULAR_ASSETS.forEach((a) => {
  ASSET_LOOKUP[a.ticker.toUpperCase()] = { ticker: a.ticker, name: a.name };
  ASSET_LOOKUP[a.name.toLowerCase()] = { ticker: a.ticker, name: a.name };
  if (a.nameHe) ASSET_LOOKUP[a.nameHe] = { ticker: a.ticker, name: a.name };
  if (a.secNum) ASSET_LOOKUP[a.secNum] = { ticker: a.ticker, name: a.name };
});

// Extra aliases, alternate spellings, and common Hebrew misspellings
const EXTRA_ALIASES: Record<string, { ticker: string; name: string }> = {
  "אנוידיה": { ticker: "NVDA", name: "NVIDIA" },
  "אנביידיה": { ticker: "NVDA", name: "NVIDIA" },
  "nvdia": { ticker: "NVDA", name: "NVIDIA" },
  "גוגל": { ticker: "GOOGL", name: "Alphabet (Google)" },
  "אלפבת": { ticker: "GOOGL", name: "Alphabet (Google)" },
  "מיקרוספט": { ticker: "MSFT", name: "Microsoft" },
  "ביטקון": { ticker: "BTC", name: "Bitcoin" },
  "bitcoin": { ticker: "BTC", name: "Bitcoin" },
  "btc": { ticker: "BTC", name: "Bitcoin" },
  "ethereum": { ticker: "ETH", name: "Ethereum" },
  "eth": { ticker: "ETH", name: "Ethereum" },
  "s&p 500": { ticker: "SPY", name: "S&P 500 ETF (SPY)" },
  "s&p": { ticker: "SPY", name: "S&P 500 ETF (SPY)" },
  "sp500": { ticker: "SPY", name: "S&P 500 ETF (SPY)" },
  "s p 500": { ticker: "SPY", name: "S&P 500 ETF (SPY)" },
  "nasdaq": { ticker: "QQQ", name: "Nasdaq 100 ETF (QQQ)" },
  "נסדק": { ticker: "QQQ", name: "Nasdaq 100 ETF (QQQ)" },
  "tesla": { ticker: "TSLA", name: "Tesla" },
  "microsoft": { ticker: "MSFT", name: "Microsoft" },
  "amazon": { ticker: "AMZN", name: "Amazon" },
  "meta": { ticker: "META", name: "Meta" },
  "apple": { ticker: "AAPL", name: "Apple" },
  "google": { ticker: "GOOGL", name: "Alphabet (Google)" },
  "alphabet": { ticker: "GOOGL", name: "Alphabet (Google)" },
  "palantir": { ticker: "PLTR", name: "Palantir" },
};
Object.assign(ASSET_LOOKUP, EXTRA_ALIASES);

function lookupAsset(raw: string): { ticker: string; name: string } | null {
  const upper = raw.toUpperCase().trim();
  const lower = raw.toLowerCase().trim();
  return ASSET_LOOKUP[upper] ?? ASSET_LOOKUP[lower] ?? ASSET_LOOKUP[raw.trim()] ?? null;
}

// Strips Hebrew filler phrases that wrap asset names in natural language input
const HEBREW_FILLER = [
  /^אני מחזיק[הת]?\s+ב[ּ]?/i, /^יש לי\s+/i, /^מחזיק[הת]?\s+ב[ּ]?/i,
  /^השקעתי\s+/i, /^^ב[ּ]?\s*/i, /^רכשתי\s+/i, /^קניתי\s+/i,
];

function parseFreeTextToHoldings(text: string): Holding[] {
  if (!text.trim()) return [];

  const chunks = text
    .split(/,|،|\n|ו[־-]\s*|(?<!\w) ו (?!\w)/u)
    .map((s) => s.trim())
    .filter(Boolean);

  const results: Holding[] = [];

  for (const chunk of chunks) {
    let working = chunk;

    // Strip Hebrew filler
    for (const re of HEBREW_FILLER) working = working.replace(re, "").trim();

    // Extract value: ₪20,000 or 20,000₪ or $5,000 or 5,000$
    const shekelMatch = working.match(/₪\s*([\d,]+(?:\.\d+)?)|( [\d,]+(?:\.\d+)?)\s*₪/);
    const dollarMatch = working.match(/\$\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*\$/);
    const value = shekelMatch
      ? `₪${(shekelMatch[1] ?? shekelMatch[2]).trim()}`
      : dollarMatch
      ? `$${(dollarMatch[1] ?? dollarMatch[2]).trim()}`
      : "";

    // Extract quantity: "10 מניות" / "10 shares" / "0.5 BTC" preceding the asset
    const qtyMatch = working.match(/([\d,.]+)\s*(?:מניות|יחידות|shares?|units?|coins?|tokens?)/i);
    const quantity = qtyMatch ? qtyMatch[1] : "";

    // Strip numerics + currency + quantity words, leaving the asset name
    let assetRaw = working
      .replace(/₪\s*[\d,]+(?:\.\d+)?/g, "")
      .replace(/[\d,]+(?:\.\d+)?\s*₪/g, "")
      .replace(/\$\s*[\d,]+(?:\.\d+)?/g, "")
      .replace(/[\d,]+(?:\.\d+)?\s*\$/g, "")
      .replace(/([\d,.]+)\s*(?:מניות|יחידות|shares?|units?|coins?|tokens?)/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!assetRaw) continue;

    const found = lookupAsset(assetRaw);
    if (found) {
      results.push({ id: `p-${Date.now()}-${results.length}`, ticker: found.ticker, name: found.name, quantity, avgCost: value });
    } else {
      // Unknown asset — best-effort ticker from the raw string
      const ticker = assetRaw.replace(/[^A-Za-z0-9:.]/g, "").toUpperCase().slice(0, 6) || "?";
      const name = assetRaw;
      results.push({ id: `p-${Date.now()}-${results.length}`, ticker, name, quantity, avgCost: value });
    }
  }

  return results;
}

// ─── Portfolio entry draft (persists through back navigation) ─────────────────

interface PortfolioDraft {
  freeText: string;
  pickedAssets: { ticker: string; name: string }[];
  confirmedScreenshot: boolean;
  detectedAssets: { ticker: string; name: string }[];
}

// ─── PortfolioEntryScreen ─────────────────────────────────────────────────────

function PortfolioEntryScreen({
  onNext, onBack, draft, onDraftChange,
}: {
  onNext: (holdings: Holding[]) => void;
  onBack: () => void;
  draft: PortfolioDraft;
  onDraftChange: (d: PortfolioDraft) => void;
}) {
  // ── Free-text state — initialized from draft so back-navigation restores ──
  const [freeText, setFreeText] = useState(draft.freeText);
  const [textFocused, setTextFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Picker state ───────────────────────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [pickedAssets, setPickedAssets] = useState<{ ticker: string; name: string }[]>(draft.pickedAssets);

  // ── Screenshot upload state — initialized from draft ──────────────────────
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "analyzing" | "detected">(
    draft.confirmedScreenshot ? "detected" : "idle"
  );
  const [detectedAssets, setDetectedAssets] = useState<{ ticker: string; name: string }[]>(draft.detectedAssets);
  const [confirmedScreenshot, setConfirmedScreenshot] = useState(draft.confirmedScreenshot);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.max(80, textareaRef.current.scrollHeight)}px`;
    }
  }, [freeText]);

  // Asset search filter
  const searchResults = searchQuery.trim().length > 0
    ? POPULAR_ASSETS.filter((a) => {
        const q = searchQuery.toLowerCase();
        return (
          a.ticker.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          (a.nameHe?.includes(searchQuery)) ||
          (a.secNum?.includes(searchQuery))
        );
      }).slice(0, 8)
    : [];

  const visiblePopular = showAll ? POPULAR_ASSETS : INITIAL_POPULAR;

  function togglePicked(ticker: string, name: string) {
    setPickedAssets((prev) =>
      prev.find((p) => p.ticker === ticker)
        ? prev.filter((p) => p.ticker !== ticker)
        : [...prev, { ticker, name }]
    );
  }

  function isPicked(ticker: string) {
    return pickedAssets.some((p) => p.ticker === ticker);
  }

  // Simulate screenshot analysis
  function handleFileSelect(file: File) {
    setUploadFile(file);
    setUploadState("analyzing");
    setConfirmedScreenshot(false);
    setTimeout(() => {
      setDetectedAssets([
        { ticker: "NVDA", name: "NVIDIA" },
        { ticker: "AAPL", name: "Apple" },
        { ticker: "BTC", name: "Bitcoin" },
      ]);
      setUploadState("detected");
    }, 2200);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) handleFileSelect(file);
  }

  // Combine all sources for canContinue
  const hasText = freeText.trim().length > 0;
  const hasPicked = pickedAssets.length > 0;
  const hasScreenshot = confirmedScreenshot && detectedAssets.length > 0;
  const canContinue = hasText || hasPicked || hasScreenshot;

  function handleContinue() {
    // Persist draft so back-navigation restores it
    onDraftChange({ freeText, pickedAssets, confirmedScreenshot, detectedAssets });

    // Parse free text into structured holdings
    const fromText = parseFreeTextToHoldings(freeText);

    // Deduplicate picked assets vs parsed (prefer parsed, which carries qty/value)
    const parsedTickers = new Set(fromText.map((h) => h.ticker));
    const fromPicked: Holding[] = pickedAssets
      .filter((a) => !parsedTickers.has(a.ticker))
      .map((a, i) => ({ id: `pk-${i}`, ticker: a.ticker, name: a.name, quantity: "", avgCost: "" }));

    const fromScreenshot: Holding[] = hasScreenshot
      ? detectedAssets.map((a, i) => ({ id: `sc-${i}`, ticker: a.ticker, name: a.name, quantity: "", avgCost: "" }))
      : [];

    const all = [...fromText, ...fromPicked, ...fromScreenshot];
    onNext(all.length > 0 ? all : [{ id: "empty", ticker: "?", name: freeText.trim(), quantity: "", avgCost: "" }]);
  }

  // Shared card style
  const cardStyle: React.CSSProperties = {
    borderRadius: 18,
    background: "linear-gradient(155deg, rgba(26,26,40,0.97) 0%, rgba(18,18,30,0.98) 100%)",
    border: "1px solid rgba(123,111,245,0.16)",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.03) inset, 0 8px 40px rgba(0,0,0,0.38)",
    overflow: "hidden",
  };

  const accentLine = (
    <div style={{ height: 1, background: "linear-gradient(90deg, transparent 5%, #7b6ff5 38%, #5b8af0 62%, transparent 95%)" }} />
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-start px-6 py-12 relative overflow-hidden">

      {/* Ambient glow */}
      <div className="absolute pointer-events-none" style={{
        width: 640, height: 520,
        top: "40%", left: "50%", transform: "translate(-50%, -50%)",
        background: "radial-gradient(ellipse 55% 55% at 50% 48%, rgba(100,88,230,0.14) 0%, rgba(80,120,240,0.06) 50%, transparent 72%)",
      }} />

      <div className="relative z-10 w-full max-w-[560px] animate-fade-up" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

        {/* ── Progress ── */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {[1, 2, 3].map((i) => (
              <div key={i} style={{
                height: 3, borderRadius: 99, transition: "all 0.3s",
                width: i === 1 ? 32 : 10,
                background: i === 1 ? "linear-gradient(90deg, #7b6ff5, #5b8af0)" : "rgba(255,255,255,0.1)",
              }} />
            ))}
          </div>
          <span style={{ fontSize: 12, fontWeight: 500, color: "#7070a0" }}>שלב 1 מתוך 3</span>
        </div>

        {/* ── Heading ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h2 style={{ fontSize: "1.65rem", fontWeight: 700, color: "#eeeef2", letterSpacing: "-0.02em", margin: 0 }}>
            מה יש בתיק ההשקעות שלך?
          </h2>
          <p style={{ fontSize: "0.92rem", lineHeight: 1.6, color: "#a0a0bc", margin: 0 }}>
            פשוט כתבו את הנכסים בהם אתם מחזיקים. רק שם הנכס נדרש — שאר הפרטים ניתן להוסיף אם רוצים.
          </p>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            METHOD 1 — כתיבה חופשית
        ══════════════════════════════════════════════════════════════════════ */}
        <div style={{
          ...cardStyle,
          border: `1px solid ${textFocused ? "rgba(123,111,245,0.42)" : "rgba(123,111,245,0.18)"}`,
          boxShadow: textFocused
            ? "0 0 0 3px rgba(123,111,245,0.1), 0 12px 48px rgba(0,0,0,0.45), 0 0 40px rgba(100,90,230,0.12)"
            : "0 0 0 1px rgba(255,255,255,0.04) inset, 0 12px 48px rgba(0,0,0,0.4), 0 0 32px rgba(100,90,230,0.07)",
          transition: "border-color 0.2s, box-shadow 0.2s",
        }}>
          {accentLine}
          <div style={{ padding: "16px 20px 18px" }}>
            {/* Section label */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5a5a80" }}>
                כתיבה חופשית
              </span>
              <span style={{ fontSize: "0.68rem", color: "#9d94f7", fontWeight: 600, background: "rgba(123,111,245,0.1)", padding: "1px 8px", borderRadius: 5, border: "1px solid rgba(123,111,245,0.18)" }}>
                מומלץ
              </span>
            </div>
            <label style={{ display: "block", marginBottom: 8, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5a5a80" }}>
              כתבו את תיק ההשקעות שלכם
            </label>
            <textarea
              ref={textareaRef}
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              onFocus={() => setTextFocused(true)}
              onBlur={() => setTextFocused(false)}
              placeholder="לדוגמה: NVIDIA, S&P 500 וביטקוין"
              style={{
                width: "100%", minHeight: 80, background: "transparent",
                border: "none", outline: "none", resize: "none",
                fontFamily: "Heebo, sans-serif", fontSize: "1rem",
                lineHeight: 1.7, color: "#eeeef2", direction: "rtl",
                caretColor: "#7b6ff5",
              }}
            />
          </div>
        </div>

        {/* ── Info note ── */}
        <div style={{
          padding: "12px 15px 13px", borderRadius: 12,
          background: "rgba(91,138,240,0.05)", border: "1px solid rgba(91,138,240,0.12)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6a9ef5" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
            </svg>
            <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "#9898c0", margin: 0 }}>שם הנכס הוא חובה</p>
          </div>
          <p style={{ fontSize: "0.76rem", lineHeight: 1.6, color: "#686890", margin: "0 0 8px 20px" }}>
            ניתן להוסיף פרטים נוספים כדי שנוכל להתאים את הפודקאסט בצורה מדויקת יותר.
          </p>
          <p style={{ fontSize: "0.71rem", color: "#484868", margin: "0 0 0 20px" }}>
            שווי • כמות • מחיר קנייה ממוצע • מטבע
          </p>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            METHOD 2 — בחירת נכסים
        ══════════════════════════════════════════════════════════════════════ */}
        <div style={cardStyle}>
          {accentLine}

          {/* Collapsible header */}
          <button
            onClick={() => setPickerOpen((v) => !v)}
            style={{
              width: "100%", padding: "15px 20px", display: "flex", alignItems: "center",
              justifyContent: "space-between", background: "none", border: "none", cursor: "pointer",
              fontFamily: "Heebo, sans-serif", textAlign: "right",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, direction: "rtl" }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: "rgba(123,111,245,0.13)", border: "1px solid rgba(123,111,245,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9d94f7" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
                </svg>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: "0.88rem", fontWeight: 700, color: "#d0d0e8", margin: 0 }}>בחירת נכסים</p>
                <p style={{ fontSize: "0.72rem", color: "#686888", margin: 0 }}>בחרו מהרשימה או חפשו את הנכס שלכם</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {pickedAssets.length > 0 && (
                <span style={{
                  fontSize: "0.7rem", fontWeight: 700, color: "#9d94f7",
                  background: "rgba(123,111,245,0.15)", border: "1px solid rgba(123,111,245,0.25)",
                  padding: "1px 8px", borderRadius: 10,
                }}>{pickedAssets.length}</span>
              )}
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="#505070" strokeWidth="2"
                style={{ transform: pickerOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </button>

          {pickerOpen && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "16px 20px 18px" }}>
              {/* Search field */}
              <div style={{
                display: "flex", alignItems: "center", gap: 10, height: 42, padding: "0 14px",
                borderRadius: 12, marginBottom: 14,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(123,111,245,0.2)",
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#505070" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="חיפוש לפי שם, סימבול או מספר נייר"
                  style={{
                    flex: 1, background: "transparent", border: "none", outline: "none",
                    fontSize: "0.88rem", color: "#d0d0ee", fontFamily: "Heebo, sans-serif",
                    direction: "rtl", caretColor: "#7b6ff5",
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#505070", lineHeight: 0, padding: 0 }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>

              {/* Search results */}
              {searchQuery.trim().length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  {searchResults.length === 0 ? (
                    <p style={{ fontSize: "0.78rem", color: "#505070", textAlign: "center", padding: "10px 0" }}>לא נמצאו תוצאות</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {searchResults.map((asset) => {
                        const picked = isPicked(asset.ticker);
                        return (
                          <div key={asset.ticker} style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "9px 12px", borderRadius: 10,
                            background: picked ? "rgba(123,111,245,0.12)" : "rgba(255,255,255,0.03)",
                            border: `1px solid ${picked ? "rgba(123,111,245,0.3)" : "rgba(255,255,255,0.07)"}`,
                            direction: "rtl",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{
                                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                                background: "rgba(123,111,245,0.12)", border: "1px solid rgba(123,111,245,0.2)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}>
                                <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "#9d94f7", fontFamily: "JetBrains Mono, monospace", direction: "ltr" }}>
                                  {asset.ticker.replace(/[^A-Z]/g, "").slice(0, 2) || asset.ticker.slice(0, 2)}
                                </span>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "#d0d0e8", margin: 0 }}>
                                  {asset.nameHe ?? asset.name}
                                </p>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#7b6ff5", fontFamily: "JetBrains Mono, monospace", direction: "ltr" }}>{asset.ticker}</span>
                                  {asset.secNum && <span style={{ fontSize: "0.68rem", color: "#484868" }}>{asset.secNum}</span>}
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => togglePicked(asset.ticker, asset.nameHe ?? asset.name)}
                              style={{
                                padding: "4px 12px", borderRadius: 8, flexShrink: 0,
                                fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                                fontFamily: "Heebo, sans-serif", transition: "all 0.18s",
                                background: picked ? "rgba(52,211,153,0.14)" : "rgba(123,111,245,0.14)",
                                border: picked ? "1px solid rgba(52,211,153,0.3)" : "1px solid rgba(123,111,245,0.3)",
                                color: picked ? "#34d399" : "#9d94f7",
                              }}
                            >
                              {picked ? "הוסף ✓" : "+ הוספה"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Popular list */}
              {searchQuery.trim().length === 0 && (
                <>
                  <p style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#484868", marginBottom: 10 }}>
                    נכסים פופולריים
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {visiblePopular.map((asset) => {
                      const picked = isPicked(asset.ticker);
                      return (
                        <button
                          key={asset.ticker}
                          onClick={() => togglePicked(asset.ticker, asset.nameHe ?? asset.name)}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "9px 12px", borderRadius: 10, width: "100%",
                            background: picked ? "rgba(123,111,245,0.12)" : "rgba(255,255,255,0.025)",
                            border: `1px solid ${picked ? "rgba(123,111,245,0.3)" : "rgba(255,255,255,0.06)"}`,
                            cursor: "pointer", transition: "all 0.15s", fontFamily: "Heebo, sans-serif",
                            direction: "rtl",
                          }}
                          onMouseEnter={(e) => { if (!picked) { e.currentTarget.style.background = "rgba(123,111,245,0.07)"; e.currentTarget.style.borderColor = "rgba(123,111,245,0.18)"; }}}
                          onMouseLeave={(e) => { if (!picked) { e.currentTarget.style.background = "rgba(255,255,255,0.025)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: "0.88rem", fontWeight: 600, color: picked ? "#d0d0ee" : "#a0a0c0" }}>
                              {asset.nameHe ?? asset.name}
                            </span>
                            <span style={{ fontSize: "0.7rem", fontWeight: 700, color: picked ? "#9d94f7" : "#585878", fontFamily: "JetBrains Mono, monospace", direction: "ltr" }}>
                              {asset.ticker}
                            </span>
                          </div>
                          <div style={{
                            width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                            background: picked ? "rgba(52,211,153,0.18)" : "transparent",
                            border: `1.5px solid ${picked ? "#34d399" : "rgba(255,255,255,0.12)"}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            transition: "all 0.15s",
                          }}>
                            {picked && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3.5"><polyline points="20 6 9 17 4 12"/></svg>}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {!showAll && POPULAR_ASSETS.length > INITIAL_POPULAR.length && (
                    <button
                      onClick={() => setShowAll(true)}
                      style={{
                        marginTop: 10, width: "100%", padding: "8px 0", borderRadius: 8,
                        background: "transparent", border: "1px solid rgba(255,255,255,0.08)",
                        fontSize: "0.8rem", color: "#686888", cursor: "pointer", fontFamily: "Heebo, sans-serif",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(123,111,245,0.28)"; e.currentTarget.style.color = "#9090b0"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#686888"; }}
                    >
                      הצגת כל הנכסים ↓
                    </button>
                  )}
                </>
              )}

              {/* Selected chips */}
              {pickedAssets.length > 0 && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <p style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#484868", marginBottom: 8 }}>
                    נכסים שנבחרו
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, direction: "rtl" }}>
                    {pickedAssets.map((a) => (
                      <div key={a.ticker} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "4px 8px 4px 10px", borderRadius: 8,
                        background: "rgba(123,111,245,0.13)", border: "1px solid rgba(123,111,245,0.26)",
                      }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#c4beff" }}>{a.name}</span>
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#7b6ff5", fontFamily: "JetBrains Mono, monospace", direction: "ltr" }}>{a.ticker}</span>
                        <button
                          onClick={() => togglePicked(a.ticker, a.name)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#505070", lineHeight: 0, padding: 0, marginRight: 2, transition: "color 0.15s" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "#505070")}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            METHOD 3 — העלאת צילום מסך
        ══════════════════════════════════════════════════════════════════════ */}
        <div style={cardStyle}>
          {accentLine}

          {/* Collapsible header */}
          <button
            onClick={() => setUploadOpen((v) => !v)}
            style={{
              width: "100%", padding: "15px 20px", display: "flex", alignItems: "center",
              justifyContent: "space-between", background: "none", border: "none", cursor: "pointer",
              fontFamily: "Heebo, sans-serif", textAlign: "right",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, direction: "rtl" }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: "rgba(91,138,240,0.13)", border: "1px solid rgba(91,138,240,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7bb3f5" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: "0.88rem", fontWeight: 700, color: "#d0d0e8", margin: 0 }}>העלאת צילום מסך</p>
                <p style={{ fontSize: "0.72rem", color: "#686888", margin: 0 }}>VESTORY יזהה את הנכסים עבורכם</p>
              </div>
            </div>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="#505070" strokeWidth="2"
              style={{ transform: uploadOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {uploadOpen && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "16px 20px 18px" }}>
              <p style={{ fontSize: "0.78rem", lineHeight: 1.6, color: "#686888", margin: "0 0 14px" }}>
                אפשר להעלות צילום מסך של תיק ההשקעות כדי ש-VESTORY יזהה את הנכסים עבורכם.
              </p>

              {/* Upload area */}
              {uploadState === "idle" && (
                <>
                  <input
                    ref={uploadRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                  />
                  <div
                    onClick={() => uploadRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    style={{
                      borderRadius: 14, padding: "28px 20px", textAlign: "center", cursor: "pointer",
                      background: dragOver ? "rgba(91,138,240,0.1)" : "rgba(255,255,255,0.025)",
                      border: `1.5px dashed ${dragOver ? "rgba(91,138,240,0.5)" : "rgba(255,255,255,0.12)"}`,
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(91,138,240,0.07)"; (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(91,138,240,0.35)"; }}
                    onMouseLeave={(e) => { if (!dragOver) { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.025)"; (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.12)"; }}}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 12, margin: "0 auto 12px",
                      background: "rgba(91,138,240,0.13)", border: "1px solid rgba(91,138,240,0.2)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7bb3f5" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                    </div>
                    <p style={{ fontSize: "0.88rem", fontWeight: 600, color: "#a0a0c0", margin: "0 0 4px" }}>העלאת קובץ</p>
                    <p style={{ fontSize: "0.72rem", color: "#505070", margin: "0 0 8px" }}>או גררו צילום מסך לכאן</p>
                    <p style={{ fontSize: "0.68rem", color: "#404060", margin: 0 }}>PNG, JPG או JPEG</p>
                  </div>
                </>
              )}

              {/* Analyzing state */}
              {uploadState === "analyzing" && (
                <div style={{
                  borderRadius: 14, padding: "20px", textAlign: "center",
                  background: "rgba(91,138,240,0.06)", border: "1px solid rgba(91,138,240,0.16)",
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%", margin: "0 auto 12px",
                    background: "conic-gradient(from 0deg, #5b8af0, transparent)",
                    animation: "spin-slow 1.1s linear infinite",
                    mask: "radial-gradient(circle at center, transparent 12px, black 14px)",
                  }} />
                  <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "#a0a0c0", margin: "0 0 4px" }}>
                    מנתח את הצילום מסך...
                  </p>
                  <p style={{ fontSize: "0.73rem", color: "#505070", margin: 0 }}>
                    {uploadFile?.name}
                  </p>
                </div>
              )}

              {/* Detected assets state */}
              {uploadState === "detected" && (
                <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(91,138,240,0.2)" }}>
                  <div style={{ padding: "12px 16px 10px", background: "rgba(91,138,240,0.07)", direction: "rtl" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "#c0c0de", margin: 0 }}>{uploadFile?.name}</p>
                    </div>
                    <p style={{ fontSize: "0.75rem", color: "#686888", margin: 0 }}>
                      זיהינו את הנכסים הבאים — בדקו שהכול נכון לפני שממשיכים.
                    </p>
                  </div>
                  <div style={{ padding: "10px 16px 14px", direction: "rtl" }}>
                    {detectedAssets.map((a) => (
                      <div key={a.ticker} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                          <span style={{ fontSize: "0.85rem", color: "#c0c0de" }}>{a.name}</span>
                          <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#7b6ff5", fontFamily: "JetBrains Mono, monospace", direction: "ltr" }}>{a.ticker}</span>
                        </div>
                      </div>
                    ))}
                    <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button
                        onClick={() => { setUploadState("idle"); setUploadFile(null); setDetectedAssets([]); setConfirmedScreenshot(false); }}
                        style={{
                          padding: "6px 14px", borderRadius: 8, fontSize: "0.78rem", fontWeight: 600,
                          background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
                          color: "#686888", cursor: "pointer", fontFamily: "Heebo, sans-serif", transition: "all 0.2s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(248,113,113,0.35)"; e.currentTarget.style.color = "#f87171"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#686888"; }}
                      >
                        ביטול
                      </button>
                      <button
                        onClick={() => setConfirmedScreenshot(true)}
                        style={{
                          padding: "6px 16px", borderRadius: 8, fontSize: "0.78rem", fontWeight: 700,
                          background: confirmedScreenshot
                            ? "rgba(52,211,153,0.15)"
                            : "linear-gradient(130deg, #7b6ff5, #5b8af0)",
                          border: confirmedScreenshot ? "1px solid rgba(52,211,153,0.35)" : "none",
                          color: confirmedScreenshot ? "#34d399" : "#fff",
                          cursor: "pointer", fontFamily: "Heebo, sans-serif", transition: "all 0.2s",
                        }}
                      >
                        {confirmedScreenshot ? "אושר ✓" : "אישור ומשך"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── CTAs ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={handleContinue}
            disabled={!canContinue}
            className="relative overflow-hidden group transition-all active:scale-[0.98]"
            style={{
              width: "100%", height: 52, borderRadius: 14,
              fontWeight: 700, fontSize: "0.92rem", fontFamily: "Heebo, sans-serif",
              background: canContinue
                ? "linear-gradient(130deg, #7b6ff5 0%, #6055e0 45%, #5b8af0 100%)"
                : "rgba(255,255,255,0.05)",
              color: canContinue ? "#fff" : "#404060",
              border: canContinue ? "none" : "1px solid rgba(255,255,255,0.08)",
              boxShadow: canContinue ? "0 2px 20px rgba(110,95,240,0.38), 0 1px 0 rgba(255,255,255,0.12) inset" : "none",
              cursor: canContinue ? "pointer" : "not-allowed",
              transition: "all 0.25s",
            }}
          >
            {canContinue && (
              <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: "linear-gradient(130deg, rgba(255,255,255,0.09) 0%, transparent 60%)", borderRadius: 14 }} />
            )}
            <span className="relative">המשך</span>
          </button>

          <button
            onClick={onBack}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: "0.8rem", color: "#505070", fontFamily: "Heebo, sans-serif",
              padding: "4px 0", transition: "color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#8080a8")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#505070")}
          >
            חזרה
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── PortfolioConfirmScreen ───────────────────────────────────────────────────

interface ConfirmRow {
  id: string;
  ticker: string;
  name: string;
  quantity: string;   // from parsed input
  value: string;      // from parsed input (₪/$ amount)
  editing: boolean;
}

function PortfolioConfirmScreen({
  holdings,
  onNext,
  onBack,
}: {
  holdings: Holding[];
  onNext: () => void;
  onBack: () => void;
}) {
  const seed: ConfirmRow[] = (
    holdings.length > 0
      ? holdings
      : [{ id: "demo", ticker: "NVDA", name: "NVIDIA", quantity: "", avgCost: "" }]
  ).map((h) => ({
    id: h.id,
    ticker: h.ticker,
    name: h.name || h.ticker,
    quantity: h.quantity ?? "",
    value: h.avgCost ?? "",
    editing: false,
  }));

  const [rows, setRows] = useState<ConfirmRow[]>(seed);

  function remove(id: string) { setRows((r) => r.filter((x) => x.id !== id)); }
  function toggleEdit(id: string) { setRows((r) => r.map((x) => x.id === id ? { ...x, editing: !x.editing } : x)); }
  function updateField(id: string, field: "quantity" | "value" | "ticker" | "name", val: string) {
    setRows((r) => r.map((x) => x.id === id ? { ...x, [field]: val } : x));
  }

  const canContinue = rows.length > 0;

  const accentLine = (
    <div style={{ height: 1, background: "linear-gradient(90deg, transparent 5%, #7b6ff5 38%, #5b8af0 62%, transparent 95%)" }} />
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden">
      <div className="absolute pointer-events-none" style={{
        width: 620, height: 520,
        top: "44%", left: "50%", transform: "translate(-50%, -50%)",
        background: "radial-gradient(ellipse 55% 55% at 50% 48%, rgba(100,88,230,0.13) 0%, rgba(80,120,240,0.06) 50%, transparent 72%)",
      }} />

      <div className="relative z-10 w-full max-w-[540px] animate-fade-up" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

        {/* Progress */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{
                height: 3, borderRadius: 99,
                width: i === 1 ? 32 : 10,
                background: i === 1 ? "linear-gradient(90deg, #7b6ff5, #5b8af0)" : "rgba(255,255,255,0.1)",
              }} />
            ))}
          </div>
          <span style={{ fontSize: 12, fontWeight: 500, color: "#7070a0" }}>שלב 1 מתוך 3</span>
        </div>

        {/* Heading */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h2 style={{ fontSize: "1.65rem", fontWeight: 700, color: "#eeeef2", letterSpacing: "-0.02em", margin: 0 }}>
            זה מה שהבנו מהתיק שלך
          </h2>
          <p style={{ fontSize: "0.92rem", lineHeight: 1.6, color: "#a0a0bc", margin: 0 }}>
            בדקו שהנכסים זוהו נכון. אם משהו לא מדויק, אפשר לתקן לפני שממשיכים.
          </p>
        </div>

        {/* Asset rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((row) => {
            const initials = row.ticker.replace(/[^A-Z]/g, "").slice(0, 2) || row.ticker.slice(0, 2).toUpperCase();
            return (
              <div key={row.id} style={{
                borderRadius: 16, overflow: "hidden",
                background: "linear-gradient(155deg, rgba(26,26,40,0.97) 0%, rgba(18,18,30,0.98) 100%)",
                border: "1px solid rgba(123,111,245,0.18)",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.03) inset, 0 4px 24px rgba(0,0,0,0.35)",
              }}>
                {accentLine}

                {/* Main row */}
                <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, direction: "rtl" }}>
                  {/* Asset badge */}
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: "linear-gradient(135deg, rgba(123,111,245,0.22), rgba(91,138,240,0.16))",
                    border: "1px solid rgba(123,111,245,0.22)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#9d94f7", fontFamily: "JetBrains Mono, monospace", direction: "ltr" }}>
                      {initials}
                    </span>
                  </div>

                  {/* Name + ticker */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#dcdcee" }}>{row.name}</span>
                      {row.ticker !== "?" && (
                        <span style={{
                          fontSize: "0.7rem", fontWeight: 700, color: "#9d94f7", direction: "ltr",
                          fontFamily: "JetBrains Mono, monospace",
                          background: "rgba(123,111,245,0.12)", border: "1px solid rgba(123,111,245,0.22)",
                          padding: "1px 7px", borderRadius: 6,
                        }}>{row.ticker}</span>
                      )}
                    </div>
                    {/* Optional details */}
                    {(row.quantity || row.value) && !row.editing && (
                      <div style={{ display: "flex", gap: 12, marginTop: 3 }}>
                        {row.quantity && (
                          <span style={{ fontSize: "0.75rem", color: "#686888" }}>כמות: {row.quantity}</span>
                        )}
                        {row.value && (
                          <span style={{ fontSize: "0.75rem", color: "#686888" }}>שווי: {row.value}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => toggleEdit(row.id)}
                      style={{
                        padding: "4px 12px", borderRadius: 8, fontSize: "0.75rem", fontWeight: 600,
                        background: row.editing ? "rgba(123,111,245,0.18)" : "rgba(255,255,255,0.05)",
                        border: `1px solid ${row.editing ? "rgba(123,111,245,0.35)" : "rgba(255,255,255,0.1)"}`,
                        color: row.editing ? "#9d94f7" : "#707090", cursor: "pointer",
                        fontFamily: "Heebo, sans-serif", transition: "all 0.18s",
                      }}
                    >
                      {row.editing ? "סיום" : "עריכה"}
                    </button>
                    <button
                      onClick={() => remove(row.id)}
                      style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.1)",
                        color: "#583838", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(248,113,113,0.15)"; e.currentTarget.style.color = "#f87171"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(248,113,113,0.05)"; e.currentTarget.style.color = "#583838"; }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Inline edit panel */}
                {row.editing && (
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "12px 16px 14px", direction: "rtl" }}>
                    <p style={{ fontSize: "0.72rem", color: "#585878", marginBottom: 12, letterSpacing: "0.02em" }}>
                      ניתן לתקן את שם הנכס, הסימבול, הכמות או השווי.
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                      {[
                        { label: "שם הנכס", field: "name" as const, placeholder: "NVIDIA", dir: "rtl" },
                        { label: "סימבול", field: "ticker" as const, placeholder: "NVDA", dir: "ltr" },
                        { label: "כמות", field: "quantity" as const, placeholder: "10", dir: "ltr" },
                        { label: "שווי", field: "value" as const, placeholder: "₪20,000", dir: "ltr" },
                      ].map(({ label, field, placeholder, dir }) => (
                        <div key={field} style={{
                          padding: "8px 10px", borderRadius: 8,
                          background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)",
                        }}>
                          <label style={{ fontSize: "0.64rem", color: "#484868", display: "block", marginBottom: 4, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                            {label}
                          </label>
                          <input
                            value={field === "ticker" ? row.ticker : field === "name" ? row.name : field === "quantity" ? row.quantity : row.value}
                            onChange={(e) => updateField(row.id, field, e.target.value)}
                            placeholder={placeholder}
                            style={{
                              width: "100%", background: "transparent", border: "none", outline: "none",
                              fontSize: "0.85rem", color: "#d0d0e8", caretColor: "#7b6ff5",
                              fontFamily: field === "ticker" ? "JetBrains Mono, monospace" : "Heebo, sans-serif",
                              direction: dir as "ltr" | "rtl",
                            }}
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

        {/* Helper note */}
        {rows.length === 0 && (
          <div style={{
            padding: "14px 16px", borderRadius: 12,
            background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.15)",
            textAlign: "center",
          }}>
            <p style={{ fontSize: "0.82rem", color: "#a07070", margin: 0 }}>
              כל הנכסים הוסרו — חזרה לעריכה כדי להוסיף נכסים.
            </p>
          </div>
        )}

        {/* CTA */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={() => {
              // Push edited rows back as holdings before continuing
              onNext();
            }}
            disabled={!canContinue}
            className="relative overflow-hidden group transition-all active:scale-[0.98]"
            style={{
              width: "100%", height: 52, borderRadius: 14,
              fontWeight: 700, fontSize: "0.92rem", fontFamily: "Heebo, sans-serif",
              background: canContinue
                ? "linear-gradient(130deg, #7b6ff5 0%, #6055e0 45%, #5b8af0 100%)"
                : "rgba(255,255,255,0.05)",
              color: canContinue ? "#fff" : "#404060",
              border: canContinue ? "none" : "1px solid rgba(255,255,255,0.08)",
              boxShadow: canContinue ? "0 2px 20px rgba(110,95,240,0.38), 0 1px 0 rgba(255,255,255,0.12) inset" : "none",
              cursor: canContinue ? "pointer" : "not-allowed",
              transition: "all 0.25s",
            }}
          >
            {canContinue && (
              <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: "linear-gradient(130deg, rgba(255,255,255,0.09) 0%, transparent 60%)", borderRadius: 14 }} />
            )}
            <span className="relative">אישור והמשך</span>
          </button>

          <button
            onClick={onBack}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: "0.8rem", color: "#505070", fontFamily: "Heebo, sans-serif",
              padding: "4px 0", transition: "color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#8080a8")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#505070")}
          >
            חזרה לעריכה
          </button>
        </div>

      </div>
    </div>
  );
}


function WatchlistScreen({
  onNext,
  onBack,
}: {
  onNext: (watchlist: WatchItem[], interests: string[]) => void;
  onBack: () => void;
}) {
  const [watchInput, setWatchInput] = useState("");
  const [watchFocused, setWatchFocused] = useState(false);
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [customInterests, setCustomInterests] = useState<string[]>([]);
  const [showCustomInput, setShowCustomInput] = useState(false);

  const WATCH_SUGGESTIONS: Record<string, string> = {
    AAPL: "Apple Inc.",
    MSFT: "Microsoft Corp.",
    GOOGL: "Alphabet Inc.",
    AMZN: "Amazon.com Inc.",
    TSLA: "Tesla Inc.",
    META: "Meta Platforms",
    NVDA: "NVIDIA Corp.",
    "TASE:NICE": "נייס סיסטמס",
    "TASE:FIBI": "בנק הפועלים",
    BTC: "Bitcoin",
    ETH: "Ethereum",
    AMD: "AMD",
    INTC: "Intel Corp.",
  };

  const suggestions = watchInput.length > 0
    ? Object.entries(WATCH_SUGGESTIONS).filter(([t, n]) =>
        t.toLowerCase().includes(watchInput.toLowerCase()) || n.toLowerCase().includes(watchInput.toLowerCase())
      )
    : [];

  function addWatch(ticker: string, name: string) {
    if (!watchlist.find((w) => w.ticker === ticker)) setWatchlist([...watchlist, { ticker, name }]);
    setWatchInput("");
  }
  function removeWatch(ticker: string) { setWatchlist(watchlist.filter((w) => w.ticker !== ticker)); }
  function toggleInterest(id: string) {
    setSelectedInterests((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  }
  function addCustom() {
    const v = customInput.trim();
    if (v && !customInterests.includes(v)) setCustomInterests((p) => [...p, v]);
    setCustomInput("");
    setShowCustomInput(false);
  }
  function removeCustom(v: string) { setCustomInterests((p) => p.filter((x) => x !== v)); }

  const hasInterest = selectedInterests.length > 0 || customInterests.length > 0;

  // Shared section card style
  const card: React.CSSProperties = {
    borderRadius: 18,
    background: "linear-gradient(155deg, rgba(26,26,40,0.97) 0%, rgba(18,18,30,0.98) 100%)",
    border: "1px solid rgba(123,111,245,0.16)",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.03) inset, 0 8px 40px rgba(0,0,0,0.38)",
    overflow: "hidden",
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden">
      {/* Glow */}
      <div className="absolute pointer-events-none" style={{
        width: 700, height: 560,
        top: "45%", left: "50%", transform: "translate(-50%, -50%)",
        background: "radial-gradient(ellipse 55% 55% at 50% 48%, rgba(100,88,230,0.12) 0%, rgba(80,120,240,0.05) 50%, transparent 72%)",
      }} />

      <div className="relative z-10 w-full max-w-[560px] animate-fade-up" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

        {/* Progress */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{
                height: 3, borderRadius: 99,
                width: i <= 2 ? 32 : 10,
                background: i <= 2 ? "linear-gradient(90deg, #7b6ff5, #5b8af0)" : "rgba(255,255,255,0.1)",
              }} />
            ))}
          </div>
          <span style={{ fontSize: 12, fontWeight: 500, color: "#7070a0" }}>שלב 2 מתוך 3</span>
        </div>

        {/* Heading */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h2 style={{ fontSize: "1.65rem", fontWeight: 700, color: "#eeeef2", letterSpacing: "-0.02em", margin: 0 }}>
            על מה עוד תרצו ש-VESTORY יעקוב?
          </h2>
          <p style={{ fontSize: "0.92rem", lineHeight: 1.6, color: "#a0a0bc", margin: 0 }}>
            הוסיפו נכסים ונושאים שמעניינים אתכם — גם אם הם לא נמצאים בתיק שלכם.
          </p>
        </div>

        {/* ── Watchlist section ── */}
        <div style={card}>
          <div style={{ height: 1, background: "linear-gradient(90deg, transparent 5%, #7b6ff5 38%, #5b8af0 62%, transparent 95%)" }} />
          <div style={{ padding: "18px 20px 20px" }}>
            {/* Section header */}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#d0d0ea", margin: 0 }}>נכסים במעקב</h3>
              <span style={{
                fontSize: "0.68rem", fontWeight: 600, color: "#505070", letterSpacing: "0.06em",
                textTransform: "uppercase", background: "rgba(255,255,255,0.05)",
                padding: "2px 8px", borderRadius: 5, border: "1px solid rgba(255,255,255,0.08)",
              }}>אופציונלי</span>
            </div>
            <p style={{ fontSize: "0.78rem", lineHeight: 1.6, color: "#686888", margin: "0 0 14px" }}>
              חברות, מניות, קרנות או נכסים שאתם רוצים להתעדכן לגביהם גם אם אינכם מחזיקים בהם כרגע.
            </p>

            {/* Search input */}
            <div style={{ position: "relative" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "0 14px", height: 42, borderRadius: 12,
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${watchFocused ? "rgba(123,111,245,0.4)" : "rgba(255,255,255,0.1)"}`,
                transition: "border-color 0.2s",
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#505070" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  value={watchInput}
                  onChange={(e) => setWatchInput(e.target.value)}
                  onFocus={() => setWatchFocused(true)}
                  onBlur={() => setTimeout(() => setWatchFocused(false), 150)}
                  placeholder="חפשו נכס, חברה או סימבול — לדוגמה TSLA, META, BTC"
                  style={{
                    flex: 1, background: "transparent", border: "none", outline: "none",
                    fontSize: "0.85rem", color: "#d0d0ee", fontFamily: "Heebo, sans-serif",
                    direction: "rtl", caretColor: "#7b6ff5",
                  }}
                />
              </div>

              {/* Dropdown */}
              {suggestions.length > 0 && (
                <div style={{
                  position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 30,
                  borderRadius: 12, overflow: "hidden",
                  background: "rgba(22,22,36,0.98)", border: "1px solid rgba(123,111,245,0.22)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                }}>
                  {suggestions.map(([ticker, name]) => (
                    <button
                      key={ticker}
                      onMouseDown={() => addWatch(ticker, name)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        width: "100%", padding: "10px 14px", textAlign: "right",
                        background: "none", border: "none", cursor: "pointer",
                        fontFamily: "Heebo, sans-serif", borderBottom: "1px solid rgba(255,255,255,0.05)",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(123,111,245,0.1)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                    >
                      <span style={{ fontSize: "0.82rem", color: "#a0a0c0" }}>{name}</span>
                      <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#7b6ff5", fontFamily: "JetBrains Mono, monospace", direction: "ltr" }}>{ticker}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected chips */}
            {watchlist.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {watchlist.map((w) => (
                  <div key={w.ticker} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 10px 5px 8px", borderRadius: 8,
                    background: "rgba(123,111,245,0.13)", border: "1px solid rgba(123,111,245,0.25)",
                  }}>
                    <div>
                      <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#9d94f7", fontFamily: "JetBrains Mono, monospace", direction: "ltr" }}>{w.ticker}</span>
                      <span style={{ fontSize: "0.72rem", color: "#707090", marginRight: 6 }}>{w.name}</span>
                    </div>
                    <button
                      onClick={() => removeWatch(w.ticker)}
                      style={{ background: "none", border: "none", color: "#505070", cursor: "pointer", lineHeight: 0, padding: 0, transition: "color 0.2s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#d0d0ee")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#505070")}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Interests section ── */}
        <div style={card}>
          <div style={{ height: 1, background: "linear-gradient(90deg, transparent 5%, #7b6ff5 38%, #5b8af0 62%, transparent 95%)" }} />
          <div style={{ padding: "18px 20px 20px" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#d0d0ea", margin: "0 0 6px" }}>תחומי עניין</h3>
            <p style={{ fontSize: "0.78rem", lineHeight: 1.6, color: "#686888", margin: "0 0 14px" }}>
              נושאים שתרצו לשמוע עליהם בפודקאסט גם כשהם לא קשורים ישירות לנכס בתיק.
            </p>

            {/* Chips grid */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
              {INTERESTS.map((interest) => {
                const sel = selectedInterests.includes(interest.id);
                return (
                  <button
                    key={interest.id}
                    onClick={() => toggleInterest(interest.id)}
                    style={{
                      padding: "6px 14px", borderRadius: 20,
                      fontSize: "0.82rem", fontWeight: sel ? 600 : 500,
                      fontFamily: "Heebo, sans-serif", cursor: "pointer",
                      transition: "all 0.18s",
                      background: sel ? "linear-gradient(130deg, rgba(123,111,245,0.28), rgba(91,138,240,0.22))" : "rgba(255,255,255,0.04)",
                      color: sel ? "#c4beff" : "#686888",
                      border: `1px solid ${sel ? "rgba(123,111,245,0.45)" : "rgba(255,255,255,0.09)"}`,
                      boxShadow: sel ? "0 0 12px rgba(123,111,245,0.2)" : "none",
                    }}
                  >
                    {interest.label}
                  </button>
                );
              })}

              {/* Custom interests */}
              {customInterests.map((ci) => (
                <div key={ci} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 10px 6px 14px", borderRadius: 20,
                  background: "linear-gradient(130deg, rgba(91,138,240,0.22), rgba(123,111,245,0.18))",
                  border: "1px solid rgba(91,138,240,0.35)",
                }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#a8c0f8" }}>{ci}</span>
                  <button
                    onClick={() => removeCustom(ci)}
                    style={{ background: "none", border: "none", color: "#506080", cursor: "pointer", lineHeight: 0, padding: 0, transition: "color 0.2s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#c0d0ff")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#506080")}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
            </div>

            {/* "At least one" nudge */}
            {!hasInterest && (
              <p style={{ fontSize: "0.75rem", color: "#585878", marginBottom: 12, lineHeight: 1.5 }}>
                בחרו לפחות תחום עניין אחד כדי שנוכל להתאים את הפודקאסט גם למה שמעניין אתכם מעבר לתיק.
              </p>
            )}

            {/* Custom interest input */}
            {showCustomInput ? (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "7px 12px", borderRadius: 10,
                background: "rgba(91,138,240,0.07)", border: "1px solid rgba(91,138,240,0.22)",
                marginBottom: 10,
              }}>
                <input
                  autoFocus
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addCustom(); if (e.key === "Escape") setShowCustomInput(false); }}
                  placeholder="לדוגמה: OpenAI, רובוטיקה, SpaceX"
                  style={{
                    flex: 1, background: "transparent", border: "none", outline: "none",
                    fontSize: "0.85rem", color: "#d0d0ee", fontFamily: "Heebo, sans-serif",
                    direction: "rtl", caretColor: "#7b6ff5",
                  }}
                />
                <button onClick={addCustom} style={{
                  padding: "3px 12px", borderRadius: 7,
                  background: "linear-gradient(130deg, #7b6ff5, #5b8af0)",
                  border: "none", color: "#fff", fontSize: "0.75rem", fontWeight: 600,
                  cursor: "pointer", fontFamily: "Heebo, sans-serif", flexShrink: 0,
                }}>הוספה</button>
                <button onClick={() => setShowCustomInput(false)} style={{
                  background: "none", border: "none", color: "#484868", cursor: "pointer",
                  fontSize: "0.78rem", fontFamily: "Heebo, sans-serif", flexShrink: 0,
                }}>ביטול</button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: "0.75rem", color: "#484868" }}>לא מצאתם את מה שמעניין אתכם?</span>
                <button
                  onClick={() => setShowCustomInput(true)}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: "0.75rem", fontWeight: 600, color: "#6868a0", fontFamily: "Heebo, sans-serif",
                    padding: 0, transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#9090d0")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#6868a0")}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  הוספת תחום עניין
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Why it matters */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 9,
          padding: "11px 14px", borderRadius: 12,
          background: "rgba(91,138,240,0.05)", border: "1px solid rgba(91,138,240,0.12)",
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5b8af0" strokeWidth="2" strokeLinecap="round" style={{ marginTop: 2, flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p style={{ fontSize: "0.77rem", lineHeight: 1.6, color: "#606080", margin: 0 }}>
            ככל שנדע טוב יותר מה מעניין אתכם, נוכל לבחור עבורכם נושאים רלוונטיים יותר לפודקאסט.
          </p>
        </div>

        {/* CTA + back */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={() => onNext(watchlist, [...selectedInterests, ...customInterests])}
            disabled={!hasInterest}
            className="relative overflow-hidden group transition-all active:scale-[0.98]"
            style={{
              width: "100%", height: 52, borderRadius: 14,
              fontWeight: 700, fontSize: "0.92rem", fontFamily: "Heebo, sans-serif",
              background: hasInterest
                ? "linear-gradient(130deg, #7b6ff5 0%, #6055e0 45%, #5b8af0 100%)"
                : "rgba(255,255,255,0.05)",
              color: hasInterest ? "#fff" : "#404060",
              border: hasInterest ? "none" : "1px solid rgba(255,255,255,0.08)",
              boxShadow: hasInterest ? "0 2px 20px rgba(110,95,240,0.38), 0 1px 0 rgba(255,255,255,0.12) inset" : "none",
              cursor: hasInterest ? "pointer" : "not-allowed",
              transition: "all 0.25s",
            }}
          >
            {hasInterest && (
              <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: "linear-gradient(130deg, rgba(255,255,255,0.09) 0%, transparent 60%)", borderRadius: 14 }} />
            )}
            <span className="relative">יצירת הפודקאסט הראשון שלי</span>
          </button>

          <button
            onClick={onBack}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: "0.8rem", color: "#505070", fontFamily: "Heebo, sans-serif",
              padding: "4px 0", transition: "color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#8080a8")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#505070")}
          >
            חזרה
          </button>
        </div>

      </div>
    </div>
  );
}

function GeneratingScreen({ holdings, interests, onDone }: { holdings: Holding[]; interests: string[]; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const firstAsset = holdings[0]?.name || holdings[0]?.ticker || "הנכסים שלך";
  const firstInterestLabel = (() => {
    const id = interests.find((i) => INTERESTS.some((x) => x.id === i));
    return INTERESTS.find((x) => x.id === id)?.label ?? interests[0] ?? "תחומי העניין שלך";
  })();
  const steps = [
    "עוברים על החדשות הרלוונטיות",
    `בודקים מה חשוב ל־${firstAsset}`,
    `מחפשים עדכונים בתחום ${firstInterestLabel}`,
    "בונים את הפודקאסט האישי שלך",
    "מסנתז קול...",
    "הפודקאסט מוכן ✓",
  ];

  useEffect(() => {
    const intervals = [800, 1600, 2400, 3400, 4600, 5200];
    const timers = intervals.map((delay, i) =>
      setTimeout(() => setStep(i + 1), delay)
    );
    const done = setTimeout(onDone, 6200);
    return () => { timers.forEach(clearTimeout); clearTimeout(done); };
  }, [onDone]);

  const progress = (step / steps.length) * 100;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md flex flex-col items-center gap-10 animate-fade-up">
        {/* Spinner */}
        <div className="relative w-24 h-24 flex items-center justify-center">
          <div
            className="absolute inset-0 rounded-full animate-spin-slow"
            style={{
              background: "conic-gradient(from 0deg, var(--color-accent), var(--color-blue), transparent)",
              mask: "radial-gradient(circle at center, transparent 38px, black 40px)",
            }}
          />
          <Logo size="md" />
        </div>

        <div className="w-full text-center">
          <h2 className="text-xl font-bold mb-2" style={{ color: "var(--color-text)" }}>
            מכין את הפודקאסט שלך
          </h2>
          <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
            זה ייקח כמה שניות...
          </p>

          {/* Progress bar */}
          <div
            className="w-full h-1.5 rounded-full mb-6 overflow-hidden"
            style={{ background: "var(--color-card)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progress}%`, background: "linear-gradient(90deg, var(--color-accent), var(--color-blue))" }}
            />
          </div>

          {/* Steps */}
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-2 justify-center transition-all duration-300"
                style={{ opacity: i < step ? 1 : 0.2 }}
              >
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: i < step ? "var(--color-accent-dim)" : "transparent",
                    border: `1px solid ${i < step ? "rgba(123,111,245,0.4)" : "var(--color-border)"}`,
                  }}
                >
                  {i < step && (
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                </div>
                <span className="text-sm" style={{ color: i < step ? "var(--color-text)" : "var(--color-text-muted)" }}>
                  {s}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Stable waveform heights (avoid Math.random() on re-render)
const WAVEFORM_HEIGHTS = Array.from({ length: 60 }, (_, i) =>
  20 + Math.sin(i * 0.4) * 14 + Math.abs(Math.sin(i * 1.1 + 0.7)) * 22
);

function DashboardScreen({ holdings, watchlist: _watchlist, interests, onNav }: { holdings: Holding[]; watchlist: WatchItem[]; interests: string[]; onNav: (s: Screen) => void }) {
  const today = new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
  const totalDuration = BRIEF_CHAPTERS.reduce((s, c) => s + c.duration, 0);
  const interestLabels = interests
    .map((id) => INTERESTS.find((i) => i.id === id)?.label ?? (INTERESTS.some((i) => i.id === id) ? null : id))
    .filter(Boolean) as string[];

  return (
    <div className="min-h-screen pb-16">
      <div className="max-w-5xl mx-auto px-6 pt-8 animate-fade-up">

        {/* Date + greeting */}
        <div className="mb-7">
          <p className="text-sm font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>{today}</p>
          <h1 className="text-3xl font-bold" style={{ color: "var(--color-text)" }}>בוקר טוב</h1>
        </div>

        <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 300px" }}>

          {/* ── Main column ── */}
          <div className="space-y-5">

            {/* ── Hero: Today's Brief ── */}
            <div
              className="rounded-2xl overflow-hidden relative"
              style={{
                background: "linear-gradient(155deg, rgba(22,22,34,0.98) 0%, rgba(16,16,28,0.99) 100%)",
                border: "1px solid rgba(123,111,245,0.22)",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.03) inset, 0 8px 48px rgba(0,0,0,0.5), 0 0 60px rgba(100,88,230,0.1)",
              }}
            >
              {/* Accent top bar */}
              <div style={{ height: 2, background: "linear-gradient(90deg, transparent 3%, #7b6ff5 30%, #5b8af0 70%, transparent 97%)" }} />

              <div className="p-6">
                {/* Header row */}
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <div className="flex items-center gap-2 mb-2.5">
                      <div
                        className="px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider"
                        style={{ background: "rgba(52,211,153,0.15)", color: "var(--color-success)" }}
                      >
                        חדש
                      </div>
                      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>07:12 בוקר</span>
                    </div>
                    <h2 className="text-xl font-bold leading-snug" style={{ color: "var(--color-text)" }}>
                      הפודקאסט של היום
                    </h2>
                    <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
                      {formatSeconds(totalDuration)} · {BRIEF_CHAPTERS.length} נושאים
                    </p>
                  </div>
                  {/* Large play button */}
                  <button
                    onClick={() => onNav("player")}
                    className="flex-shrink-0 transition-all hover:scale-105 active:scale-95"
                    style={{
                      width: 56, height: 56, borderRadius: "50%",
                      background: "linear-gradient(135deg, #7b6ff5, #5b8af0)",
                      boxShadow: "0 2px 20px rgba(110,95,240,0.45), 0 0 0 1px rgba(255,255,255,0.12) inset",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="none"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                  </button>
                </div>

                {/* Waveform — LTR: played (purple) on LEFT, unplayed on RIGHT */}
                <div className="flex items-end gap-0.5 mb-5" style={{ height: 40, opacity: 0.55, direction: "ltr" }}>
                  {WAVEFORM_HEIGHTS.map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-full"
                      style={{
                        height: `${h}%`,
                        background: i < 14
                          ? "linear-gradient(to top, #7b6ff5, #5b8af0)"
                          : "rgba(255,255,255,0.12)",
                      }}
                    />
                  ))}
                </div>

                {/* Chapter list */}
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {BRIEF_CHAPTERS.slice(0, 3).map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => onNav("player")}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono w-4 text-center flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>{ch.id}</span>
                        <span className="text-sm text-right" style={{ color: "var(--color-text)" }}>{ch.title}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>{ch.time}</span>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          className="opacity-0 group-hover:opacity-40 transition-opacity" style={{ color: "var(--color-text)" }}>
                          <polygon points="5 3 19 12 5 21 5 3"/>
                        </svg>
                      </div>
                    </button>
                  ))}
                  {BRIEF_CHAPTERS.length > 3 && (
                    <button
                      onClick={() => onNav("player")}
                      className="w-full text-center py-2 transition-colors hover:opacity-70"
                      style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}
                    >
                      + {BRIEF_CHAPTERS.length - 3} נושאים נוספים
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ── Why these topics ── */}
            <div>
              <h3 style={{
                fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 10,
              }}>
                למה הנושאים האלה בפודקאסט שלך?
              </h3>
              <div className="grid gap-3" style={{ gridTemplateColumns: holdings.length === 0 ? "1fr" : "1fr 1fr" }}>

                {/* One card per holding */}
                {holdings.map((h) => (
                  <button
                    key={h.ticker}
                    onClick={() => onNav("player")}
                    className="text-right transition-all hover:scale-[1.01] active:scale-[0.99]"
                    style={{
                      borderRadius: 14, padding: "14px 15px",
                      background: "rgba(52,211,153,0.04)",
                      border: "1px solid rgba(52,211,153,0.14)",
                      boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span style={{
                        fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
                        color: "#34d399", background: "rgba(52,211,153,0.12)",
                        padding: "2px 6px", borderRadius: 4,
                      }}>מהתיק</span>
                      <span className="text-sm font-bold font-mono" style={{ color: "#eeeef2", direction: "ltr" }}>{h.ticker}</span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: "#8a8ab0" }}>
                      עדכון משמעותי בנכס שנמצא בתיק שלך — מה קרה ומה זה אומר עבורך.
                    </p>
                  </button>
                ))}

                {/* One card per interest (up to 3 minus holdings count) */}
                {interestLabels.slice(0, Math.max(1, 3 - holdings.length)).map((label) => (
                  <button
                    key={label}
                    onClick={() => onNav("player")}
                    className="text-right transition-all hover:scale-[1.01] active:scale-[0.99]"
                    style={{
                      borderRadius: 14, padding: "14px 15px",
                      background: "rgba(123,111,245,0.05)",
                      border: "1px solid rgba(123,111,245,0.16)",
                      boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span style={{
                        fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
                        color: "#9d94f7", background: "rgba(123,111,245,0.14)",
                        padding: "2px 6px", borderRadius: 4,
                      }}>תחום עניין</span>
                      <span className="text-sm font-semibold" style={{ color: "#eeeef2" }}>{label}</span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: "#8a8ab0" }}>
                      אירוע משמעותי בתחום שבחרת לעקוב אחריו.
                    </p>
                  </button>
                ))}

              </div>
            </div>

          </div>

          {/* ── Side column ── */}
          <div className="space-y-4">

            {/* Portfolio card */}
            <div
              className="rounded-2xl p-5"
              style={{
                background: "var(--color-card)", border: "1px solid var(--color-border)",
                boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
              }}
            >
              <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text)" }}>התיק שלך</h3>

              {holdings.length === 0 ? (
                <div className="text-center py-5">
                  <p className="text-xs mb-3" style={{ color: "var(--color-text-muted)" }}>עדיין לא הוספת נכסים לתיק</p>
                  <button
                    onClick={() => onNav("settings-portfolio")}
                    className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:bg-white/5"
                    style={{ color: "var(--color-accent)", border: "1px solid rgba(123,111,245,0.25)" }}
                  >
                    הוספת נכס
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {holdings.map((h) => {
                    const mkt = MARKET_DATA[h.ticker];
                    const isUp = mkt && mkt.change >= 0;
                    return (
                      <div key={h.ticker} className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div style={{
                            width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                            background: "rgba(123,111,245,0.12)", border: "1px solid rgba(123,111,245,0.2)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <span className="font-bold font-mono" style={{ fontSize: "0.65rem", color: "#9d94f7" }}>
                              {h.ticker.replace(/[^A-Z]/g, "").slice(0, 2)}
                            </span>
                          </div>
                          <div>
                            <p className="text-xs font-semibold font-mono" style={{ color: "var(--color-text)", direction: "ltr" }}>{h.ticker}</p>
                            {h.name && <p style={{ fontSize: "0.68rem", color: "var(--color-text-muted)" }}>{h.name}</p>}
                          </div>
                        </div>
                        {mkt && (
                          <span className="text-xs font-mono font-semibold" style={{ color: isUp ? "var(--color-success)" : "var(--color-danger)" }}>
                            {isUp ? "+" : ""}{mkt.change}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                onClick={() => onNav("settings-portfolio")}
                className="w-full mt-4 text-xs py-2 rounded-lg hover:bg-white/5 transition-colors"
                style={{ color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}
              >
                עריכת התיק
              </button>
            </div>

            {/* דופק השוק */}
            <div
              className="rounded-2xl p-5"
              style={{
                background: "var(--color-card)", border: "1px solid var(--color-border)",
                boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
              }}
            >
              <div className="flex items-baseline justify-between mb-1">
                <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>דופק השוק</h3>
              </div>
              <p style={{ fontSize: "0.68rem", color: "var(--color-text-muted)", marginBottom: 14 }}>
                תמונת מצב מהירה של השווקים
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {[
                  { name: "S&P 500", val: "5,648", change: "+0.8%", up: true },
                  { name: "NASDAQ", val: "17,842", change: "+1.1%", up: true },
                  { name: "ת\"א 125", val: "2,301", change: "-0.2%", up: false },
                  { name: "דולר / שקל", val: "3.72", change: "+0.3%", up: true },
                ].map((m) => (
                  <div key={m.name} className="flex items-center justify-between">
                    <span style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>{m.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono" style={{ color: "var(--color-text)" }}>{m.val}</span>
                      <span
                        className="text-xs font-mono font-semibold"
                        style={{ color: m.up ? "var(--color-success)" : "var(--color-danger)" }}
                      >
                        {m.change}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: "0.65rem", color: "var(--color-text-muted)", marginTop: 12 }}>
                עודכן: 07:10 · לפני פתיחת המסחר
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerScreen({ onNav }: { onNav: (s: Screen) => void }) {
  const totalDuration = BRIEF_CHAPTERS.reduce((s, c) => s + c.duration, 0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [activeChapter, setActiveChapter] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setElapsed((e) => {
          if (e >= totalDuration) { setPlaying(false); return totalDuration; }
          return e + 0.25 * speed;
        });
      }, 250);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, speed, totalDuration]);

  useEffect(() => {
    let acc = 0;
    for (let i = 0; i < BRIEF_CHAPTERS.length; i++) {
      acc += BRIEF_CHAPTERS[i].duration;
      if (elapsed < acc) { setActiveChapter(i); break; }
    }
  }, [elapsed]);

  const progress = elapsed / totalDuration;

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    setElapsed(ratio * totalDuration);
  }

  function skipChapter(dir: 1 | -1) {
    const next = clamp(activeChapter + dir, 0, BRIEF_CHAPTERS.length - 1);
    let acc = BRIEF_CHAPTERS.slice(0, next).reduce((s, c) => s + c.duration, 0);
    setElapsed(acc);
  }

  return (
    <div className="min-h-screen pb-16">
      <div className="max-w-5xl mx-auto px-6 pt-8 animate-fade-up">
        <button
          onClick={() => onNav("dashboard")}
          className="flex items-center gap-1.5 text-sm mb-6 transition-colors hover:opacity-70"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          חזרה ללוח היום
        </button>

        <div className="grid gap-8" style={{ gridTemplateColumns: "1fr 280px" }}>
          {/* Player */}
          <div>
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>
                הפודקאסט של {new Date().toLocaleDateString("he-IL", { day: "numeric", month: "long" })}
              </h1>
              <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
                {formatSeconds(totalDuration)} · {BRIEF_CHAPTERS.length} נושאים
              </p>
            </div>

            {/* Now playing */}
            <div
              className="rounded-2xl p-6 mb-5 card-shadow relative overflow-hidden"
              style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}
            >
              <div className="absolute top-0 left-0 right-0 h-0.5 accent-gradient" />

              {/* Active chapter */}
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="px-2 py-0.5 rounded text-xs font-semibold"
                  style={{ background: "var(--color-accent-dim)", color: "var(--color-accent)" }}
                >
                  פרק {activeChapter + 1}
                </div>
                {playing && (
                  <div className="flex items-end gap-0.5 h-3">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-0.5 rounded-full"
                        style={{
                          height: "100%",
                          background: "var(--color-accent)",
                          animation: `waveform 0.8s ease-in-out ${i * 0.15}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
              <h2 className="text-lg font-semibold mb-6" style={{ color: "var(--color-text)" }}>
                {BRIEF_CHAPTERS[activeChapter].title}
              </h2>

              {/* Waveform — always LTR: bar 0 = leftmost = start of audio */}
              <div
                className="rounded-lg overflow-hidden cursor-pointer"
                style={{ background: "var(--color-elevated)", padding: "8px", marginBottom: 8 }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  // LTR: left = 0, right = end
                  const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
                  setElapsed(ratio * totalDuration);
                }}
              >
                <div className="flex items-end gap-px" style={{ height: 56, direction: "ltr" }}>
                  {Array.from({ length: 80 }).map((_, i) => {
                    const played = (i / 80) < progress;
                    return (
                      <div
                        key={i}
                        className="flex-1 rounded-sm"
                        style={{
                          height: `${25 + Math.sin(i * 0.35) * 20 + Math.abs(Math.sin(i * 0.8)) * 25}%`,
                          background: played
                            ? "linear-gradient(to top, var(--color-accent), var(--color-blue))"
                            : "var(--color-border-strong)",
                          transition: "background 0.1s",
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Time — LTR: elapsed on left, total on right */}
              <div className="flex items-center justify-between mb-5 text-xs font-mono" style={{ color: "var(--color-text-muted)", direction: "ltr" }}>
                <span>{formatSeconds(elapsed)}</span>
                <span>{formatSeconds(totalDuration)}</span>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setSpeed(speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1)}
                  className="px-2.5 py-1 rounded-md text-xs font-mono font-semibold transition-colors hover:bg-white/5"
                  style={{ color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
                >
                  {speed}×
                </button>

                <div className="flex items-center gap-4">
                  <button
                    onClick={() => skipChapter(-1)}
                    className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
                  </button>

                  <button
                    onClick={() => setPlaying(!playing)}
                    className="w-14 h-14 rounded-full flex items-center justify-center glow-accent transition-all hover:scale-105 active:scale-95"
                    style={{ background: "linear-gradient(135deg, var(--color-accent), var(--color-blue))" }}
                  >
                    {playing ? (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    )}
                  </button>

                  <button
                    onClick={() => skipChapter(1)}
                    className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
                  </button>
                </div>

                <button
                  onClick={() => onNav("sources")}
                  className="px-2.5 py-1 rounded-md text-xs font-semibold transition-colors hover:bg-white/5"
                  style={{ color: "var(--color-accent)", border: "1px solid rgba(123,111,245,0.25)" }}
                >
                  מקורות
                </button>
              </div>
            </div>
          </div>

          {/* Chapter list */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--color-text-muted)" }}>
              פרקים
            </h3>
            <div className="space-y-1">
              {BRIEF_CHAPTERS.map((ch, i) => {
                const isActive = i === activeChapter;
                const chStart = BRIEF_CHAPTERS.slice(0, i).reduce((s, c) => s + c.duration, 0);
                const isDone = elapsed > chStart + ch.duration;

                return (
                  <button
                    key={ch.id}
                    onClick={() => {
                      setElapsed(chStart);
                      setPlaying(true);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-right"
                    style={{
                      background: isActive ? "var(--color-accent-dim)" : "transparent",
                      border: `1px solid ${isActive ? "rgba(123,111,245,0.2)" : "transparent"}`,
                    }}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        background: isDone
                          ? "rgba(52,211,153,0.15)"
                          : isActive
                          ? "var(--color-accent-dim)"
                          : "var(--color-elevated)",
                      }}
                    >
                      {isDone ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : (
                        <span className="text-xs font-mono" style={{ color: isActive ? "var(--color-accent)" : "var(--color-text-muted)" }}>
                          {ch.id}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-medium text-right truncate"
                        style={{ color: isActive ? "var(--color-accent)" : isDone ? "var(--color-text-secondary)" : "var(--color-text)" }}
                      >
                        {ch.title}
                      </p>
                      <p className="text-xs font-mono mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                        {formatSeconds(ch.duration)}
                      </p>
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

function SourcesScreen({ onNav }: { onNav: (s: Screen) => void }) {
  const grouped = BRIEF_CHAPTERS.map((ch) => ({
    chapter: ch,
    sources: SOURCES.filter((s) => s.chapter === ch.title),
  })).filter((g) => g.sources.length > 0);

  return (
    <div className="min-h-screen pb-16">
      <div className="max-w-3xl mx-auto px-6 pt-8 animate-fade-up">
        <button
          onClick={() => onNav("player")}
          className="flex items-center gap-1.5 text-sm mb-6 transition-colors hover:opacity-70"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          חזרה לנגן
        </button>

        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>מקורות</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            כל הטענות בפודקאסט מגובות במקורות אלה
          </p>
        </div>

        <div className="space-y-8">
          {grouped.map(({ chapter, sources }) => (
            <div key={chapter.id}>
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono flex-shrink-0"
                  style={{ background: "var(--color-accent-dim)", color: "var(--color-accent)" }}
                >
                  {chapter.id}
                </div>
                <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{chapter.title}</h2>
              </div>
              <div className="space-y-2 mr-9">
                {sources.map((s) => (
                  <a
                    key={s.id}
                    href={s.url}
                    className="flex items-start justify-between p-4 rounded-xl transition-all hover:border-white/10 group block"
                    style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}
                  >
                    <div className="flex-1 min-w-0 ml-3">
                      <p className="text-sm font-medium leading-snug" style={{ color: "var(--color-text)" }}>{s.title}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded"
                          style={{ background: "var(--color-elevated)", color: "var(--color-text-secondary)" }}
                        >
                          {s.outlet}
                        </span>
                        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{s.time}</span>
                      </div>
                    </div>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="flex-shrink-0 mt-0.5 opacity-30 group-hover:opacity-70 transition-opacity"
                      style={{ color: "var(--color-text)" }}
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PortfolioSettingsScreen({ holdings, setHoldings, onNav }: { holdings: Holding[]; setHoldings: React.Dispatch<React.SetStateAction<Holding[]>>; onNav: (s: Screen) => void }) {
  const [saved, setSaved] = useState(false);
  // picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllPop, setShowAllPop] = useState(false);
  // screenshot state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "analyzing" | "detected">("idle");
  const [detectedAssets, setDetectedAssets] = useState<{ ticker: string; name: string }[]>([]);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function removeHolding(id: string) { setHoldings(holdings.filter((h) => h.id !== id)); }
  function updateHolding(id: string, field: keyof Holding, value: string) {
    setHoldings(holdings.map((h) => (h.id === id ? { ...h, [field]: value } : h)));
  }
  function addHolding() {
    setHoldings([...holdings, { id: Date.now().toString(), ticker: "", name: "", quantity: "", avgCost: "" }]);
  }
  function addFromPicker(ticker: string, name: string) {
    if (!holdings.find((h) => h.ticker === ticker)) {
      setHoldings([...holdings, { id: Date.now().toString(), ticker, name, quantity: "", avgCost: "" }]);
    }
  }
  function save() { setSaved(true); setTimeout(() => setSaved(false), 2000); }

  const searchResults = searchQuery.trim().length > 0
    ? POPULAR_ASSETS.filter((a) => {
        const q = searchQuery.toLowerCase();
        return a.ticker.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || (a.nameHe?.includes(searchQuery)) || (a.secNum?.includes(searchQuery));
      }).slice(0, 6)
    : [];

  const visiblePop = showAllPop ? POPULAR_ASSETS.slice(0, 20) : POPULAR_ASSETS.slice(0, 6);

  function handleFileSelect(file: File) {
    setUploadFile(file);
    setUploadState("analyzing");
    setTimeout(() => {
      setDetectedAssets([{ ticker: "NVDA", name: "NVIDIA" }, { ticker: "AAPL", name: "Apple" }, { ticker: "BTC", name: "Bitcoin" }]);
      setUploadState("detected");
    }, 2200);
  }

  function confirmDetected() {
    const toAdd = detectedAssets.filter((a) => !holdings.find((h) => h.ticker === a.ticker));
    setHoldings([...holdings, ...toAdd.map((a) => ({ id: Date.now().toString() + a.ticker, ticker: a.ticker, name: a.name, quantity: "", avgCost: "" }))]);
    setUploadState("idle"); setUploadFile(null); setDetectedAssets([]);
  }

  const accentLine = <div style={{ height: 1, background: "linear-gradient(90deg, transparent 5%, #7b6ff5 38%, #5b8af0 62%, transparent 95%)" }} />;

  return (
    <div className="min-h-screen pb-16">
      <div className="max-w-3xl mx-auto px-6 pt-8 animate-fade-up space-y-5">
        <div className="mb-2">
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>התיק שלי</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            עדכן את האחזקות שלך לקבלת פודקאסט מדויק יותר
          </p>
        </div>

        {/* Info note */}
        <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: "rgba(91,138,240,0.06)", border: "1px solid rgba(91,138,240,0.13)" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6a9ef5" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 2 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className="text-xs leading-relaxed" style={{ color: "#686890" }}>
            פרטים נוספים יעזרו ל-VESTORY לדייק יותר את ההתאמה האישית של הפודקאסט.
          </p>
        </div>

        {/* ── Current holdings ── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}>
          {holdings.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm mb-1" style={{ color: "var(--color-text-muted)" }}>עדיין לא הוספת נכסים</p>
            </div>
          ) : (
            holdings.map((h) => (
              <div key={h.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                <div className="flex items-center gap-4 px-5 py-3.5">
                  <div style={{
                    width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                    background: "rgba(123,111,245,0.12)", border: "1px solid rgba(123,111,245,0.18)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span className="text-xs font-bold font-mono" style={{ color: "#9d94f7" }}>
                      {h.ticker.replace(/[^A-Z]/g, "").slice(0, 2)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold font-mono" style={{ color: "var(--color-text)", direction: "ltr" }}>{h.ticker}</p>
                    {h.name && <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{h.name}</p>}
                  </div>
                  <button onClick={() => removeHolding(h.id)} className="opacity-30 hover:opacity-70 transition-opacity" style={{ color: "var(--color-danger)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <div className="px-5 pb-3.5 grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  {([
                    { label: "כמות", field: "quantity" as const, placeholder: "מס׳ יחידות" },
                    { label: "מחיר קנייה ממוצע", field: "avgCost" as const, placeholder: "₪ / $" },
                  ] as const).map(({ label, field, placeholder }) => (
                    <div key={field} style={{ borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", padding: "7px 10px" }}>
                      <label className="text-xs block mb-1" style={{ color: "var(--color-text-muted)", letterSpacing: "0.04em" }}>{label}</label>
                      <input
                        value={field === "quantity" ? h.quantity : h.avgCost}
                        onChange={(e) => updateHolding(h.id, field, e.target.value)}
                        placeholder={placeholder}
                        className="w-full bg-transparent outline-none text-sm font-mono"
                        style={{ color: "var(--color-text)", direction: "ltr" }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
          <div style={{ borderTop: "1px solid var(--color-border)" }}>
            <button
              onClick={addHolding}
              className="flex items-center gap-2 text-sm px-5 py-3.5 w-full hover:bg-white/5 transition-colors"
              style={{ color: "var(--color-text-muted)" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              הוספת נכס ידנית
            </button>
          </div>
        </div>

        {/* ── Asset picker ── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "linear-gradient(155deg, rgba(26,26,40,0.97) 0%, rgba(18,18,30,0.98) 100%)", border: "1px solid rgba(123,111,245,0.16)" }}>
          {accentLine}
          <button
            onClick={() => setPickerOpen((v) => !v)}
            style={{
              width: "100%", padding: "15px 20px", display: "flex", alignItems: "center",
              justifyContent: "space-between", background: "none", border: "none", cursor: "pointer",
              fontFamily: "Heebo, sans-serif", direction: "rtl",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: "rgba(123,111,245,0.13)", border: "1px solid rgba(123,111,245,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9d94f7" strokeWidth="2" strokeLinecap="round"><path d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/></svg>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: "0.88rem", fontWeight: 700, color: "#d0d0e8", margin: 0 }}>הוספה מהרשימה</p>
                <p style={{ fontSize: "0.72rem", color: "#686888", margin: 0 }}>בחרו מהרשימה של מניות נפוצות או חפשו נכס</p>
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#505070" strokeWidth="2" style={{ transform: pickerOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {pickerOpen && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "14px 20px 18px" }}>
              <p style={{ fontSize: "0.78rem", color: "#686888", margin: "0 0 12px" }}>
                אפשר לבחור מהרשימה של מניות נפוצות או לחפש נכס לפי שם, סימבול או מספר נייר.
              </p>
              {/* Search */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, height: 40, padding: "0 14px", borderRadius: 12, marginBottom: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(123,111,245,0.2)" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#505070" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="חיפוש לפי שם, סימבול או מספר נייר"
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: "0.86rem", color: "#d0d0ee", fontFamily: "Heebo, sans-serif", direction: "rtl", caretColor: "#7b6ff5" }}
                />
                {searchQuery && <button onClick={() => setSearchQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#505070", lineHeight: 0, padding: 0 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
              </div>

              {/* Results or popular list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {(searchQuery.trim() ? searchResults : visiblePop).map((asset) => {
                  const inPortfolio = !!holdings.find((h) => h.ticker === asset.ticker);
                  return (
                    <div key={asset.ticker} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 10, background: inPortfolio ? "rgba(52,211,153,0.06)" : "rgba(255,255,255,0.025)", border: `1px solid ${inPortfolio ? "rgba(52,211,153,0.2)" : "rgba(255,255,255,0.06)"}`, direction: "rtl" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: "0.86rem", fontWeight: 600, color: "#c0c0de" }}>{asset.nameHe ?? asset.name}</span>
                        <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#7b6ff5", fontFamily: "JetBrains Mono, monospace", direction: "ltr" }}>{asset.ticker}</span>
                      </div>
                      <button
                        onClick={() => addFromPicker(asset.ticker, asset.nameHe ?? asset.name)}
                        disabled={inPortfolio}
                        style={{ padding: "3px 12px", borderRadius: 7, fontSize: "0.74rem", fontWeight: 600, cursor: inPortfolio ? "default" : "pointer", fontFamily: "Heebo, sans-serif", background: inPortfolio ? "rgba(52,211,153,0.12)" : "rgba(123,111,245,0.14)", border: inPortfolio ? "1px solid rgba(52,211,153,0.25)" : "1px solid rgba(123,111,245,0.3)", color: inPortfolio ? "#34d399" : "#9d94f7", transition: "all 0.15s", flexShrink: 0 }}
                      >
                        {inPortfolio ? "נוסף ✓" : "+ הוספה"}
                      </button>
                    </div>
                  );
                })}
                {!searchQuery.trim() && !showAllPop && (
                  <button onClick={() => setShowAllPop(true)} style={{ marginTop: 6, width: "100%", padding: "7px 0", borderRadius: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.08)", fontSize: "0.78rem", color: "#686888", cursor: "pointer", fontFamily: "Heebo, sans-serif", transition: "all 0.2s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(123,111,245,0.28)"; e.currentTarget.style.color = "#9090b0"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#686888"; }}>
                    הצגת כל הנכסים ↓
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Screenshot upload ── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "linear-gradient(155deg, rgba(26,26,40,0.97) 0%, rgba(18,18,30,0.98) 100%)", border: "1px solid rgba(91,138,240,0.16)" }}>
          <div style={{ height: 1, background: "linear-gradient(90deg, transparent 5%, #5b8af0 38%, #7b6ff5 62%, transparent 95%)" }} />
          <button
            onClick={() => setUploadOpen((v) => !v)}
            style={{ width: "100%", padding: "15px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", fontFamily: "Heebo, sans-serif", direction: "rtl" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: "rgba(91,138,240,0.13)", border: "1px solid rgba(91,138,240,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7bb3f5" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: "0.88rem", fontWeight: 700, color: "#d0d0e8", margin: 0 }}>העלאת צילום מסך</p>
                <p style={{ fontSize: "0.72rem", color: "#686888", margin: 0 }}>VESTORY יזהה את הנכסים עבורך</p>
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#505070" strokeWidth="2" style={{ transform: uploadOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {uploadOpen && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "14px 20px 18px" }}>
              <p style={{ fontSize: "0.78rem", color: "#686888", margin: "0 0 14px" }}>
                אפשר להעלות צילום מסך של תיק ההשקעות כדי ש-VESTORY יזהה את הנכסים עבורך.
              </p>
              <input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/jpg" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />

              {uploadState === "idle" && (
                <div
                  onClick={() => uploadRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) handleFileSelect(f); }}
                  style={{ borderRadius: 12, padding: "22px 20px", textAlign: "center", cursor: "pointer", background: dragOver ? "rgba(91,138,240,0.1)" : "rgba(255,255,255,0.02)", border: `1.5px dashed ${dragOver ? "rgba(91,138,240,0.5)" : "rgba(255,255,255,0.1)"}`, transition: "all 0.2s" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(91,138,240,0.07)"; }}
                  onMouseLeave={(e) => { if (!dragOver) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.02)"; }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 10, margin: "0 auto 10px", background: "rgba(91,138,240,0.13)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7bb3f5" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  </div>
                  <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "#a0a0c0", margin: "0 0 3px" }}>העלאת קובץ</p>
                  <p style={{ fontSize: "0.7rem", color: "#505070", margin: "0 0 6px" }}>או גררו צילום מסך לכאן</p>
                  <p style={{ fontSize: "0.66rem", color: "#404060", margin: 0 }}>PNG, JPG או JPEG</p>
                </div>
              )}

              {uploadState === "analyzing" && (
                <div style={{ borderRadius: 12, padding: "18px", textAlign: "center", background: "rgba(91,138,240,0.06)", border: "1px solid rgba(91,138,240,0.16)" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", margin: "0 auto 10px", background: "conic-gradient(from 0deg, #5b8af0, transparent)", animation: "spin-slow 1.1s linear infinite", mask: "radial-gradient(circle at center, transparent 11px, black 13px)" }} />
                  <p style={{ fontSize: "0.83rem", fontWeight: 600, color: "#a0a0c0", margin: "0 0 3px" }}>מנתח את הצילום מסך...</p>
                  <p style={{ fontSize: "0.7rem", color: "#505070", margin: 0 }}>{uploadFile?.name}</p>
                </div>
              )}

              {uploadState === "detected" && (
                <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(91,138,240,0.2)" }}>
                  <div style={{ padding: "10px 14px 8px", background: "rgba(91,138,240,0.07)", direction: "rtl" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      <p style={{ fontSize: "0.8rem", fontWeight: 700, color: "#c0c0de", margin: 0 }}>{uploadFile?.name}</p>
                    </div>
                    <p style={{ fontSize: "0.73rem", color: "#686888", margin: 0 }}>זיהינו את הנכסים הבאים — בדקו שהכול נכון לפני שממשיכים.</p>
                  </div>
                  <div style={{ padding: "10px 14px 14px", direction: "rtl" }}>
                    {detectedAssets.map((a) => (
                      <div key={a.ticker} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        <span style={{ fontSize: "0.83rem", color: "#c0c0de" }}>{a.name}</span>
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#7b6ff5", fontFamily: "JetBrains Mono, monospace", direction: "ltr" }}>{a.ticker}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button onClick={() => { setUploadState("idle"); setUploadFile(null); setDetectedAssets([]); }} style={{ padding: "5px 13px", borderRadius: 7, fontSize: "0.76rem", fontWeight: 600, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#686888", cursor: "pointer", fontFamily: "Heebo, sans-serif" }} onMouseEnter={(e) => { e.currentTarget.style.color = "#f87171"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.3)"; }} onMouseLeave={(e) => { e.currentTarget.style.color = "#686888"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}>ביטול</button>
                      <button onClick={confirmDetected} style={{ padding: "5px 16px", borderRadius: 7, fontSize: "0.76rem", fontWeight: 700, background: "linear-gradient(130deg, #7b6ff5, #5b8af0)", border: "none", color: "#fff", cursor: "pointer", fontFamily: "Heebo, sans-serif" }}>אישור והוספה</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <button onClick={save} className="px-6 h-10 rounded-xl text-sm font-semibold text-white accent-gradient transition-all hover:opacity-90 active:scale-95">
          {saved ? "נשמר ✓" : "שמירת שינויים"}
        </button>
      </div>
    </div>
  );
}

function PersonalizationScreen({ watchlist, setWatchlist, interests, setInterests, onNav }: {
  watchlist: WatchItem[];
  setWatchlist: React.Dispatch<React.SetStateAction<WatchItem[]>>;
  interests: string[];
  setInterests: React.Dispatch<React.SetStateAction<string[]>>;
  onNav: (s: Screen) => void;
}) {
  const predefinedIds = interests.filter((id) => INTERESTS.some((i) => i.id === id));
  const initialCustom = interests.filter((id) => !INTERESTS.some((i) => i.id === id));
  const [selectedInterests, setSelectedInterests] = useState<string[]>(predefinedIds);
  const [customInterests, setCustomInterests] = useState<string[]>(initialCustom);
  const [interestInput, setInterestInput] = useState("");
  const [interestFocused, setInterestFocused] = useState(false);
  const [briefTime, setBriefTime] = useState("07:00");
  const [briefDuration, setBriefDuration] = useState(7);
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [watchInput, setWatchInput] = useState("");
  const [watchFocused, setWatchFocused] = useState(false);
  const [saved, setSaved] = useState(false);

  const WATCH_SUGGESTIONS: Record<string, string> = {
    TSLA: "Tesla Inc.", META: "Meta Platforms", BTC: "Bitcoin", ETH: "Ethereum",
    NVDA: "NVIDIA Corp.", AAPL: "Apple Inc.", MSFT: "Microsoft Corp.",
    "TASE:NICE": "נייס סיסטמס", "TASE:FIBI": "בנק הפועלים",
    AMD: "AMD", INTC: "Intel Corp.",
  };

  const suggestions = watchInput
    ? Object.entries(WATCH_SUGGESTIONS).filter(([t, n]) => t.toLowerCase().includes(watchInput.toLowerCase()) || n.toLowerCase().includes(watchInput.toLowerCase()))
    : [];

  function toggleInterest(id: string) {
    setSelectedInterests((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  }

  function addCustomInterest() {
    const v = interestInput.trim();
    if (v && !customInterests.includes(v)) setCustomInterests((p) => [...p, v]);
    setInterestInput("");
  }
  function removeCustomInterest(v: string) { setCustomInterests((p) => p.filter((x) => x !== v)); }

  function save() {
    setInterests([...selectedInterests, ...customInterests]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="min-h-screen pb-16">
      <div className="max-w-3xl mx-auto px-6 pt-8 animate-fade-up">
        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>העדפות</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            התאם את הפודקאסט לאופן שבו אתה רוצה לשמוע
          </p>
        </div>

        <div className="space-y-6">
          {/* Brief timing */}
          <div
            className="rounded-2xl p-5 card-shadow"
            style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}
          >
            <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text)" }}>תזמון הפודקאסט</h3>
            <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <label className="text-xs mb-2 block" style={{ color: "var(--color-text-muted)" }}>שעת שליחה</label>
                <input
                  type="time"
                  value={briefTime}
                  onChange={(e) => setBriefTime(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg text-sm font-mono outline-none"
                  style={{
                    background: "var(--color-elevated)",
                    border: "1px solid var(--color-border-strong)",
                    color: "var(--color-text)",
                    direction: "ltr",
                  }}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>אורך הפודקאסט</label>
                  <span className="text-xs font-semibold" style={{ color: "var(--color-accent)" }}>{briefDuration} דקות</span>
                </div>
                <div style={{ position: "relative", padding: "6px 0" }}>
                  <input
                    type="range"
                    min={3}
                    max={10}
                    step={1}
                    value={briefDuration}
                    onChange={(e) => setBriefDuration(Number(e.target.value))}
                    style={{
                      width: "100%", height: 4, appearance: "none", WebkitAppearance: "none",
                      background: `linear-gradient(to left, var(--color-accent) ${((briefDuration - 3) / 7) * 100}%, rgba(255,255,255,0.1) ${((briefDuration - 3) / 7) * 100}%)`,
                      borderRadius: 2, outline: "none", cursor: "pointer", direction: "ltr",
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, direction: "ltr" }}>
                    <span style={{ fontSize: "0.65rem", color: "var(--color-text-muted)" }}>3 דק׳</span>
                    <span style={{ fontSize: "0.65rem", color: "var(--color-text-muted)" }}>10 דק׳</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Watchlist */}
          <div
            className="rounded-2xl p-5 card-shadow"
            style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}
          >
            <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--color-text)" }}>נכסים במעקב</h3>
            <p className="text-xs mb-4" style={{ color: "var(--color-text-muted)" }}>
              אפשר להוסיף חברות או נכסים שתרצה להתעדכן לגביהם גם בלי להחזיק בהם.
            </p>

            {/* Search */}
            <div className="relative mb-3">
              <div style={{
                display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 12px",
                borderRadius: 10, background: "var(--color-elevated)",
                border: `1px solid ${watchFocused ? "rgba(123,111,245,0.4)" : "var(--color-border-strong)"}`,
                transition: "border-color 0.2s",
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  value={watchInput}
                  onChange={(e) => setWatchInput(e.target.value)}
                  onFocus={() => setWatchFocused(true)}
                  onBlur={() => setTimeout(() => setWatchFocused(false), 150)}
                  placeholder="הוספת נכס למעקב"
                  style={{
                    flex: 1, background: "transparent", border: "none", outline: "none",
                    fontSize: "0.85rem", color: "var(--color-text)", fontFamily: "Heebo, sans-serif",
                    direction: "rtl",
                  }}
                />
              </div>
              {suggestions.length > 0 && (
                <div className="absolute top-full mt-1 z-20 w-full rounded-xl overflow-hidden card-shadow"
                  style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border-strong)" }}>
                  {suggestions.map(([ticker, name]) => (
                    <button
                      key={ticker}
                      onMouseDown={() => { if (!watchlist.find((w) => w.ticker === ticker)) setWatchlist([...watchlist, { ticker, name }]); setWatchInput(""); }}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-white/5 transition-colors"
                    >
                      <span style={{ color: "var(--color-text-secondary)" }}>{name}</span>
                      <span className="font-mono text-xs" style={{ color: "var(--color-accent)" }}>{ticker}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Chips or empty state */}
            {watchlist.length === 0 ? (
              <div className="text-center py-5" style={{ borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)" }}>
                <p className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>עדיין לא הוספת נכסים למעקב</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {watchlist.map((w) => (
                  <div key={w.ticker} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-mono"
                    style={{ background: "var(--color-accent-dim)", color: "var(--color-accent)", border: "1px solid rgba(123,111,245,0.25)" }}>
                    {w.ticker}
                    <button onClick={() => setWatchlist(watchlist.filter((x) => x.ticker !== w.ticker))} className="opacity-60 hover:opacity-100">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Interests */}
          <div
            className="rounded-2xl p-5 card-shadow"
            style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}
          >
            <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--color-text)" }}>תחומי עניין</h3>
            <p className="text-xs mb-4" style={{ color: "var(--color-text-muted)" }}>
              בחרו נושאים שתרצו לשמוע עליהם בפודקאסט.
            </p>

            {/* Predefined chips */}
            <div className="flex flex-wrap gap-2 mb-4">
              {INTERESTS.map((interest) => {
                const selected = selectedInterests.includes(interest.id);
                return (
                  <button
                    key={interest.id}
                    onClick={() => toggleInterest(interest.id)}
                    className="px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all"
                    style={{
                      background: selected ? "var(--color-accent-dim)" : "var(--color-elevated)",
                      color: selected ? "var(--color-accent)" : "var(--color-text-secondary)",
                      border: `1px solid ${selected ? "rgba(123,111,245,0.3)" : "var(--color-border)"}`,
                    }}
                  >
                    {interest.label}
                  </button>
                );
              })}
              {/* Custom interest chips */}
              {customInterests.map((ci) => (
                <div
                  key={ci}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
                  style={{
                    background: "var(--color-accent-dim)", color: "var(--color-accent)",
                    border: "1px solid rgba(123,111,245,0.3)",
                  }}
                >
                  <span>{ci}</span>
                  <button
                    onClick={() => removeCustomInterest(ci)}
                    className="opacity-60 hover:opacity-100 transition-opacity"
                    style={{ lineHeight: 0, background: "none", border: "none", cursor: "pointer", color: "inherit" }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
            </div>

            {/* Helper + custom search/add */}
            <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 14 }}>
              <p className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>
                לא מצאתם תחום שמעניין אתכם? אפשר לחפש או להוסיף תחום עניין נוסף.
              </p>
              <div style={{ position: "relative" }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px",
                  borderRadius: 10, background: "var(--color-elevated)",
                  border: `1px solid ${interestFocused ? "rgba(123,111,245,0.4)" : "var(--color-border-strong)"}`,
                  transition: "border-color 0.2s",
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    value={interestInput}
                    onChange={(e) => setInterestInput(e.target.value)}
                    onFocus={() => setInterestFocused(true)}
                    onBlur={() => setInterestFocused(false)}
                    onKeyDown={(e) => { if (e.key === "Enter") addCustomInterest(); }}
                    placeholder="חיפוש או הוספת תחום עניין"
                    style={{
                      flex: 1, background: "transparent", border: "none", outline: "none",
                      fontSize: "0.83rem", color: "var(--color-text)", fontFamily: "Heebo, sans-serif",
                      direction: "rtl", caretColor: "var(--color-accent)",
                    }}
                  />
                  {interestInput.trim() && (
                    <button
                      onMouseDown={addCustomInterest}
                      style={{
                        flexShrink: 0, padding: "2px 10px", borderRadius: 6,
                        background: "linear-gradient(130deg, #7b6ff5, #5b8af0)",
                        border: "none", color: "#fff", fontSize: "0.72rem", fontWeight: 600,
                        cursor: "pointer", fontFamily: "Heebo, sans-serif",
                      }}
                    >הוספה</button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Notification */}
          <div
            className="rounded-2xl p-5 card-shadow"
            style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>התראות</h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>קבל התראה כשהפודקאסט מוכן</p>
              </div>
              <button
                onClick={() => setNotifEnabled((v) => !v)}
                style={{
                  position: "relative", width: 42, height: 24, borderRadius: 12,
                  background: notifEnabled ? "var(--color-accent)" : "rgba(255,255,255,0.12)",
                  border: "none", cursor: "pointer", transition: "background 0.2s", flexShrink: 0,
                }}
              >
                <div style={{
                  position: "absolute", top: 3, width: 18, height: 18, borderRadius: "50%",
                  background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                  left: notifEnabled ? "calc(100% - 21px)" : 3,
                  transition: "left 0.2s",
                }} />
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={save}
          className="mt-6 px-6 h-10 rounded-xl text-sm font-semibold text-white accent-gradient transition-all hover:opacity-90 active:scale-95"
        >
          {saved ? "נשמר ✓" : "שמירת שינויים"}
        </button>
      </div>
    </div>
  );
}

// ─── History screen ──────────────────────────────────────────────────────────

const HISTORY_ITEMS = [
  { id: "h1", date: new Date(2026, 8, 13), duration: "5:34", topics: 5 },
  { id: "h2", date: new Date(2026, 8, 12), duration: "6:02", topics: 4 },
  { id: "h3", date: new Date(2026, 8, 11), duration: "4:48", topics: 4 },
  { id: "h4", date: new Date(2026, 8, 10), duration: "7:15", topics: 5 },
  { id: "h5", date: new Date(2026, 8,  9), duration: "5:51", topics: 4 },
  { id: "h6", date: new Date(2026, 8,  8), duration: "6:30", topics: 5 },
  { id: "h7", date: new Date(2026, 8,  7), duration: "4:22", topics: 3 },
  { id: "h8", date: new Date(2026, 8,  6), duration: "7:04", topics: 5 },
  { id: "h9", date: new Date(2026, 8,  5), duration: "5:17", topics: 4 },
];

function HistoryScreen({ onNav }: { onNav: (s: Screen) => void }) {
  const [playing, setPlaying] = useState<string | null>(null);

  function fmtDate(d: Date) {
    return d.toLocaleDateString("he-IL", { day: "numeric", month: "long" });
  }

  function isoWeek(d: Date) {
    const ms = d.getTime();
    const now = Date.now();
    const diff = now - ms;
    if (diff < 7 * 86400000) return "השבוע";
    if (diff < 14 * 86400000) return "שבוע שעבר";
    return d.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
  }

  // Group by week bucket
  const groups: { label: string; items: typeof HISTORY_ITEMS }[] = [];
  for (const item of HISTORY_ITEMS) {
    const label = isoWeek(item.date);
    const existing = groups.find((g) => g.label === label);
    if (existing) existing.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <div className="min-h-screen pb-16">
      <div className="max-w-3xl mx-auto px-6 pt-8 animate-fade-up">

        {/* Heading */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>היסטוריית הפודקאסטים שלך</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            כאן אפשר לראות את כל הפודקאסטים הקודמים שנוצרו עבורך.
          </p>
        </div>

        <div className="space-y-8">
          {groups.map((group) => (
            <div key={group.label}>
              {/* Group label */}
              <p style={{
                fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 10,
              }}>
                {group.label}
              </p>

              {/* Cards */}
              <div className="space-y-2">
                {group.items.map((item) => {
                  const isPlaying = playing === item.id;
                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl overflow-hidden transition-all"
                      style={{
                        background: "linear-gradient(155deg, rgba(22,22,34,0.98) 0%, rgba(16,16,28,0.99) 100%)",
                        border: `1px solid ${isPlaying ? "rgba(123,111,245,0.35)" : "rgba(255,255,255,0.07)"}`,
                        boxShadow: isPlaying
                          ? "0 0 0 1px rgba(255,255,255,0.03) inset, 0 4px 32px rgba(100,88,230,0.15)"
                          : "0 0 0 1px rgba(255,255,255,0.02) inset, 0 2px 12px rgba(0,0,0,0.3)",
                      }}
                    >
                      {/* Accent line — only when playing */}
                      {isPlaying && (
                        <div style={{ height: 1, background: "linear-gradient(90deg, transparent 5%, #7b6ff5 38%, #5b8af0 62%, transparent 95%)" }} />
                      )}

                      <div className="flex items-center gap-4 px-5 py-4" style={{ direction: "rtl" }}>
                        {/* Play/Pause button */}
                        <button
                          onClick={() => setPlaying(isPlaying ? null : item.id)}
                          className="flex-shrink-0 transition-all hover:scale-105 active:scale-95"
                          style={{
                            width: 40, height: 40, borderRadius: "50%",
                            background: isPlaying
                              ? "linear-gradient(135deg, #7b6ff5, #5b8af0)"
                              : "rgba(123,111,245,0.13)",
                            border: isPlaying ? "none" : "1px solid rgba(123,111,245,0.25)",
                            boxShadow: isPlaying ? "0 2px 16px rgba(110,95,240,0.4)" : "none",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer",
                          }}
                        >
                          {isPlaying ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                              <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                            </svg>
                          ) : (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="#9d94f7" stroke="none">
                              <polygon points="6 3 20 12 6 21 6 3"/>
                            </svg>
                          )}
                        </button>

                        {/* Text */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p className="font-semibold" style={{ fontSize: "0.92rem", color: "var(--color-text)", margin: 0 }}>
                            הפודקאסט של {fmtDate(item.date)}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5" style={{ direction: "ltr", justifyContent: "flex-end" }}>
                            <span style={{ fontSize: "0.72rem", color: "var(--color-text-muted)", fontFamily: "JetBrains Mono, monospace" }}>
                              {item.duration}
                            </span>
                            <span style={{ fontSize: "0.65rem", color: "var(--color-text-muted)" }}>·</span>
                            <span style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}>
                              {item.topics} נושאים
                            </span>
                          </div>
                        </div>

                        {/* Mini waveform (decorative) */}
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 1.5, height: 20, opacity: isPlaying ? 0.7 : 0.25, direction: "ltr", flexShrink: 0 }}>
                          {Array.from({ length: 18 }).map((_, i) => (
                            <div key={i} style={{
                              width: 2, borderRadius: 99,
                              height: `${30 + Math.sin(i * 0.7 + item.id.charCodeAt(1)) * 18 + Math.abs(Math.sin(i * 1.3)) * 28}%`,
                              background: isPlaying
                                ? (i / 18 < 0.35 ? "linear-gradient(to top, #7b6ff5, #5b8af0)" : "rgba(255,255,255,0.15)")
                                : "rgba(255,255,255,0.2)",
                              transition: "background 0.3s",
                            }} />
                          ))}
                        </div>

                        {/* Open link */}
                        <button
                          onClick={() => onNav("player")}
                          style={{
                            padding: "5px 14px", borderRadius: 8, flexShrink: 0,
                            fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                            fontFamily: "Heebo, sans-serif",
                            background: "rgba(123,111,245,0.1)", border: "1px solid rgba(123,111,245,0.22)",
                            color: "var(--color-accent)", transition: "all 0.18s",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(123,111,245,0.18)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(123,111,245,0.1)"; }}
                        >
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
      </div>
    </div>
  );
}

// ─── App shell ────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [interests, setInterests] = useState<string[]>([]);

  // Draft persists through portfolio-entry ↔ portfolio-confirm back-navigation
  const [portfolioDraft, setPortfolioDraft] = useState<PortfolioDraft>({
    freeText: "",
    pickedAssets: [],
    confirmedScreenshot: false,
    detectedAssets: [],
  });

  function goTo(s: Screen) { setScreen(s); window.scrollTo(0, 0); }

  return (
    <div style={{ minHeight: "100%", background: "var(--color-bg)" }}>
      <TopBar onNav={goTo} screen={screen} />

      {screen === "welcome" && <WelcomeScreen onNext={() => goTo("portfolio-entry")} />}
      {screen === "portfolio-entry" && (
        <PortfolioEntryScreen
          draft={portfolioDraft}
          onDraftChange={setPortfolioDraft}
          onNext={(h) => {
            setHoldings(h);
            goTo(h.length > 0 ? "portfolio-confirm" : "watchlist");
          }}
          onBack={() => goTo("welcome")}
        />
      )}
      {screen === "portfolio-confirm" && (
        <PortfolioConfirmScreen
          holdings={holdings}
          onNext={() => goTo("watchlist")}
          onBack={() => goTo("portfolio-entry")}
        />
      )}
      {screen === "watchlist" && (
        <WatchlistScreen
          onNext={(wl, ints) => {
            setWatchlist(wl);
            setInterests(ints);
            goTo("generating");
          }}
          onBack={() => goTo("portfolio-confirm")}
        />
      )}
      {screen === "generating" && (
        <GeneratingScreen holdings={holdings} interests={interests} onDone={() => goTo("dashboard")} />
      )}
      {screen === "dashboard" && (
        <DashboardScreen holdings={holdings} watchlist={watchlist} interests={interests} onNav={goTo} />
      )}
      {screen === "player" && <PlayerScreen onNav={goTo} />}
      {screen === "sources" && <SourcesScreen onNav={goTo} />}
      {screen === "settings-portfolio" && (
        <PortfolioSettingsScreen holdings={holdings} setHoldings={setHoldings} onNav={goTo} />
      )}
      {screen === "settings-personalization" && (
        <PersonalizationScreen
          watchlist={watchlist}
          setWatchlist={setWatchlist}
          interests={interests}
          setInterests={setInterests}
          onNav={goTo}
        />
      )}
      {screen === "history" && <HistoryScreen onNav={goTo} />}
    </div>
  );
}

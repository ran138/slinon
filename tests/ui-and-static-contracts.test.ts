import { readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readRepositoryFile, repositoryRoot } from "./helpers";

function filesUnder(path: string, predicate: (name: string) => boolean): string[] {
  const absolute = resolve(repositoryRoot, path);
  return readdirSync(absolute, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && predicate(entry.name))
    .map((entry) => relative(repositoryRoot, resolve(entry.parentPath, entry.name)));
}

describe("Today dashboard regressions", () => {
  const dashboard = readRepositoryFile("product/components/today-dashboard.tsx");
  const app = readRepositoryFile("product/components/vestory-app.tsx");
  const styles = readRepositoryFile("product/app/globals.css");

  it("uses a real Jerusalem-time greeting for all four parts of the day", () => {
    expect(dashboard).toContain('timeZone: "Asia/Jerusalem"');
    for (const greeting of ["בוקר טוב", "צהריים טובים", "ערב טוב", "לילה טוב"]) {
      expect(dashboard).toContain(greeting);
    }
  });

  it("loads market quotes for tracked assets and degrades safely", () => {
    expect(dashboard).toContain("/api/market-data?tickers=");
    expect(dashboard).toContain('catch(() => { /* asset cards fall back to "no market data" on failure */ })');
    expect(dashboard).toContain("today-trend-empty");
  });

  it("renders one continuous player with chapter start markers", () => {
    expect(dashboard).toContain("src={brief.audioUrl}");
    expect(app).toContain("(c.startMs ?? 0) <= elapsedMs");
    expect(dashboard).toContain("chapter.startMs / totalDuration");
    expect(dashboard).toContain("onSeekChapter(index)");
    expect(styles).toContain(".today-chapter-marker");
  });

  it("preserves the full-player speed cycle including half speed", () => {
    expect(app).toContain("speed === 1 ? 1.5 : speed === 1.5 ? 2 : speed === 2 ? 0.5 : 1");
  });

  it("shows chapter start time rather than chapter duration", () => {
    expect(app).toContain("fmtMs(ch.startMs)");
    expect(dashboard).toContain("time(chapter.startMs / 1000)");
  });

  it("marks sensitive portfolio quantities and values for analytics redaction", () => {
    expect(app.match(/className="ph-mask-text"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(readRepositoryFile("product/lib/analytics.ts")).toContain('maskTextSelector: ".ph-mask-text"');
  });

  it("keeps the Today layout responsive and its quick cards equalized", () => {
    expect(styles).toContain(".today-insight-list");
    expect(styles).toContain("align-items:stretch");
    expect(styles).toContain(".today-podcast-grid>section>* { flex:1; }");
    expect(styles).toContain("@media(max-width:600px)");
  });
});

describe("authentication and legal UI", () => {
  const authForm = readRepositoryFile("product/components/auth/auth-form.tsx");

  it("requires terms consent and links to both legal documents", () => {
    expect(authForm).toContain("agreedToTerms");
    expect(authForm).toContain('href="/privacy"');
    expect(authForm).toContain('href="/terms"');
  });

  it("maps callback failures to a safe message without rendering raw provider details", () => {
    expect(authForm).toContain("oauthError ?");
    expect(authForm).toContain("ההתחברות נכשלה. נסו שוב או התחברו בדרך אחרת.");
    expect(authForm).not.toContain("error_description");
    expect(authForm).not.toContain("error_code");
  });

  it("uses the same Vestory wordmark on auth and application surfaces", () => {
    expect(readRepositoryFile("product/app/(auth)/layout.tsx")).toContain("VestoryWordmark");
    expect(readRepositoryFile("product/components/vestory-app.tsx")).toContain("VestoryWordmark");
  });

  it("ships complete privacy and terms pages", () => {
    const privacy = readRepositoryFile("product/app/privacy/page.tsx");
    const terms = readRepositoryFile("product/app/terms/page.tsx");
    expect(privacy).toContain("מדיניות פרטיות");
    expect(terms).toContain("תנאי שימוש");
    expect(privacy).toContain("LegalPage");
    expect(terms).toContain("LegalPage");
  });
});

describe("static marketing and company sites", () => {
  const marketingPages = [
    ...filesUnder("marketing_page", (name) => name === "index.html"),
    ...filesUnder("product/public/marketing", (name) => name === "index.html"),
    ...filesUnder("product/public", (name) => name === "index.html")
      .filter((path) => !path.startsWith("product/public/about/") && !path.startsWith("product/public/marketing/")),
  ];

  it.each(marketingPages)("keeps privacy and terms navigation in %s", (path) => {
    const html = readRepositoryFile(path);
    expect(html).toMatch(/privacy/);
    expect(html).toMatch(/terms/);
  });

  it("keeps the final marketing source synchronized with its deployed copy", () => {
    for (const path of ["app.js", "source-orbit.js"]) {
      expect(readRepositoryFile(`product/public/marketing/${path}`)).toBe(readRepositoryFile(`marketing_page/${path}`));
    }
  });

  it("supports accessible menus, FAQs, reduced motion and interactive demos", () => {
    const script = readRepositoryFile("marketing_page/app.js");
    expect(script).toContain("aria-expanded");
    expect(script).toContain("faq-button");
    expect(script).toContain("prefers-reduced-motion: reduce");
    expect(script).toContain("IntersectionObserver");
    expect(script).toContain("speechSynthesis");
  });

  it("lets users pause the source orbit and honors reduced-motion preference", () => {
    const orbit = readRepositoryFile("marketing_page/source-orbit.js");
    expect(orbit).toContain("source-motion-control");
    expect(orbit).toContain("prefers-reduced-motion: reduce");
    expect(orbit).toContain("pause.addEventListener('change', motionState)");
  });

  it("keeps the company-site menu keyboard accessible", () => {
    const source = readRepositoryFile("on_slinon_page/app.js");
    expect(source).toContain("aria-expanded");
    expect(source).toContain("event.key==='Escape'");
    expect(source).toContain("prefers-reduced-motion: reduce");
  });

  it("uses transparent Slinon logo assets on both public sites", () => {
    expect(readRepositoryFile("on_slinon_page/index.html")).toContain("slinon-logo-v2.png");
    expect(readRepositoryFile("product/next.config.ts")).toContain('/assets/slinon-logo.png", destination: "/marketing/assets/slinon-logo.png');
  });
});

describe("preserved Vite interface prototype", () => {
  const prototype = readRepositoryFile("ui_vestory_web_app/src/App.tsx");

  it("retains the complete prototype screen map", () => {
    for (const screen of [
      "welcome", "portfolio-entry", "portfolio-confirm", "watchlist", "generating",
      "dashboard", "player", "sources", "settings-portfolio", "settings-personalization", "history",
    ]) expect(prototype).toContain(`\"${screen}\"`);
  });

  it("retains portfolio, personalization, source and playback demonstrations", () => {
    expect(prototype).toContain("MARKET_DATA");
    expect(prototype).toContain("INTERESTS");
    expect(prototype).toContain("BRIEF_CHAPTERS");
    expect(prototype).toContain("SOURCES");
    expect(prototype).toContain("formatSeconds");
  });

  it("keeps the prototype mounted through the documented Vite entrypoint", () => {
    expect(readRepositoryFile("ui_vestory_web_app/src/main.tsx")).toContain("<App />");
    expect(readRepositoryFile("ui_vestory_web_app/index.html")).toContain('id="root"');
  });
});

describe("delivery, analytics and email contracts", () => {
  it("polls podcast schedules every ten minutes with a protected request", () => {
    const workflow = readRepositoryFile(".github/workflows/Podcast_Scheduler.yml");
    expect(workflow).toContain('cron: "*/10 * * * *"');
    expect(workflow).toContain('Authorization: Bearer ${CRON_SECRET}');
    expect(workflow).toContain("--retry-all-errors");
  });

  it("keeps Supabase active through three bounded authenticated reads per day", () => {
    const workflow = readRepositoryFile(".github/workflows/Supabase_Stay_Alive.yml");
    expect(workflow).toContain('cron: "17 1,9,17 * * *"');
    expect(workflow).toContain('Authorization: Bearer ${KEEPALIVE_SECRET}');
    expect(workflow).toContain("/api/keepalive");
  });

  it("retains the daily Vercel scheduler as a fallback", () => {
    expect(JSON.parse(readRepositoryFile("product/vercel.json"))).toEqual({
      crons: [{ path: "/api/scheduler/tick", schedule: "0 5 * * *" }],
    });
  });

  it("permits PostHog ingestion and Finnhub logos only on the application CSP", () => {
    const config = readRepositoryFile("product/next.config.ts");
    expect(config).toContain("https://us.i.posthog.com");
    expect(config).toContain("https://eu.i.posthog.com");
    expect(config).toContain("https://*.finnhub.io");
    expect(config).toContain("X-Frame-Options");
  });

  it("configures identified-only analytics and resets identity at sign-out", () => {
    const analytics = readRepositoryFile("product/lib/analytics.ts");
    expect(analytics).toContain('defaults: "2026-05-30"');
    expect(analytics).toContain('person_profiles: "identified_only"');
    expect(analytics).toContain("posthog.reset()");
  });

  it("sends podcast email with plain text, unsubscribe metadata and a Slinon footer", () => {
    const email = readRepositoryFile("product/lib/email.ts");
    expect(email).toContain('"List-Unsubscribe"');
    expect(email).toContain("customer.service@slinon.me");
    expect(email).toContain("slinon-logo-transparent.png");
    expect(email).toContain("text:");
    expect(email).toContain("html:");
  });

  it("keeps database maintenance and legacy migration restricted to local services", () => {
    for (const script of [
      "product/scripts/apply-supabase-schema.mjs",
      "product/scripts/import-portfolio-knowledge.mjs",
      "product/scripts/migrate-sqlite-to-supabase.mjs",
    ]) expect(readRepositoryFile(script)).toContain("assertLocalServiceEnvironment");
  });

  it("keeps local Supabase actions allowlisted and generated secrets uncommitted", () => {
    const local = readRepositoryFile("product/scripts/local-supabase.mjs");
    expect(local).toContain('["start", "stop", "reset", "status"]');
    expect(local).toContain("assertLocalUrl");
    expect(local).toContain("mode: 0o600");
    expect(readRepositoryFile("product/supabase/.gitignore")).toContain(".temp");
  });

  it("validates ingestion mode and required service credentials", () => {
    const ingestion = readRepositoryFile("product/scripts/run-ingestion.ts");
    expect(ingestion).toContain('runType !== "daily" && runType !== "backfill"');
    expect(ingestion).toContain("SUPABASE_SERVICE_ROLE_KEY is required");
    expect(ingestion).toContain("OPENAI_API_KEY is required");
    expect(ingestion).toContain("SEC_USER_AGENT is required");
  });
});

import Link from "next/link";
import { Logo } from "@/components/logo";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "#080910", direction: "rtl", fontFamily: "Heebo, sans-serif" }}>
      <header className="sticky top-0 z-50" style={{ borderBottom: "1px solid #292c3d", background: "rgba(9,10,17,0.92)", backdropFilter: "blur(18px)" }}>
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5" style={{ textDecoration: "none" }}>
            <Logo size="sm" />
            <span className="font-bold text-sm" style={{ color: "#f7f7fb" }}>VESTORY</span>
          </a>
          <Link href="/vestory_app" style={{ fontSize: "0.82rem", color: "#7b6ff5", textDecoration: "none" }}>חזרה לאפליקציה</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 style={{ fontSize: "2rem", fontWeight: 800, color: "#f7f7fb", marginBottom: 6 }}>{title}</h1>
        <p style={{ fontSize: "0.82rem", color: "#565968", marginBottom: 40 }}>עדכון אחרון: {updated}</p>
        <div className="legal-content">{children}</div>
      </main>

      <footer className="flex items-center justify-center" style={{ padding: "24px 16px 32px" }}>
        <Logo size="sm" />
      </footer>

      <style>{`
        .legal-content h2 {
          font-size: 1.15rem; font-weight: 700; color: #f7f7fb;
          margin: 32px 0 12px;
        }
        .legal-content h2:first-child { margin-top: 0; }
        .legal-content p, .legal-content li {
          font-size: 0.92rem; line-height: 1.85; color: #c4c4d6;
        }
        .legal-content ul { margin: 8px 0 16px; padding-inline-start: 22px; display: flex; flex-direction: column; gap: 8px; }
        .legal-content p { margin: 0 0 16px; }
        .legal-content a { color: #7b6ff5; text-decoration: none; }
        .legal-content a:hover { text-decoration: underline; }
      `}</style>
    </div>
  );
}

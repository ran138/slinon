import { Logo } from "@/components/logo";

export function LegalFooter() {
  return (
    <footer style={{ padding: "20px 0", fontSize: "0.75rem", color: "#565968", direction: "rtl" }}>
      <div className="max-w-5xl mx-auto px-6 grid items-center" style={{ gridTemplateColumns: "1fr auto 1fr" }}>
        <div />
        <div className="flex items-center justify-center gap-4">
          <a href="/terms" style={{ color: "#565968", textDecoration: "none" }}>תנאי שימוש</a>
          <span style={{ color: "#292c3d" }}>•</span>
          <a href="/privacy" style={{ color: "#565968", textDecoration: "none" }}>מדיניות פרטיות</a>
        </div>
        <div className="flex" style={{ justifyContent: "flex-end" }}>
          <Logo size="sm" />
        </div>
      </div>
    </footer>
  );
}

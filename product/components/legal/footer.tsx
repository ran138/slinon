import { Logo } from "@/components/logo";

export function LegalFooter() {
  return (
    <footer
      className="grid items-center"
      style={{ gridTemplateColumns: "1fr auto 1fr", padding: "20px 16px", fontSize: "0.75rem", color: "#565968", direction: "rtl" }}
    >
      <div />
      <div className="flex items-center justify-center gap-4">
        <a href="/terms" style={{ color: "#565968", textDecoration: "none" }}>תנאי שימוש</a>
        <span style={{ color: "#292c3d" }}>•</span>
        <a href="/privacy" style={{ color: "#565968", textDecoration: "none" }}>מדיניות פרטיות</a>
      </div>
      <div className="flex" style={{ justifyContent: "flex-end" }}>
        <Logo size="sm" />
      </div>
    </footer>
  );
}

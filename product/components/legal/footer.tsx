export function LegalFooter() {
  return (
    <footer
      className="flex items-center justify-center gap-4"
      style={{ padding: "20px 16px", fontSize: "0.75rem", color: "#565968", direction: "rtl" }}
    >
      <a href="/terms" style={{ color: "#565968", textDecoration: "none" }}>תנאי שימוש</a>
      <span style={{ color: "#292c3d" }}>•</span>
      <a href="/privacy" style={{ color: "#565968", textDecoration: "none" }}>מדיניות פרטיות</a>
    </footer>
  );
}

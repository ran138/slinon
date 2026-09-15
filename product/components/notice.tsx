export function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "error" }) {
  return (
    <div
      role="alert"
      style={{
        padding: "12px 15px", borderRadius: 12, fontSize: "0.85rem", lineHeight: 1.6,
        background: tone === "error" ? "rgba(248,113,113,0.08)" : "rgba(91,138,240,0.06)",
        border: `1px solid ${tone === "error" ? "rgba(248,113,113,0.25)" : "rgba(91,138,240,0.14)"}`,
        color: tone === "error" ? "#f5a3a3" : "#a0b8ec",
      }}
    >
      {children}
    </div>
  );
}

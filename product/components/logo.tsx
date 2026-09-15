export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const w = size === "sm" ? 58 : size === "lg" ? 110 : 80;
  return (
    <div style={{ isolation: "isolate", display: "flex", alignItems: "center", flexShrink: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/slinon-logo-transparent.png" alt="slinon" style={{ width: w, height: "auto", opacity: 1 }} />
    </div>
  );
}

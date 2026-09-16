export function VestoryWordmark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const fontSize = size === "sm" ? "0.85rem" : size === "lg" ? "clamp(2.75rem, 7vw, 3.75rem)" : "1.5rem";
  return (
    <span
      style={{
        fontSize,
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
    </span>
  );
}

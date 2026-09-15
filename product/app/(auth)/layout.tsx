import { Logo } from "@/components/logo";
import { LegalFooter } from "@/components/legal/footer";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: "#080910", direction: "rtl", fontFamily: "Heebo, sans-serif" }}
    >
      <div style={{ width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Logo size="md" />
        </div>
        <div
          style={{
            background: "#11131e", border: "1px solid #292c3d", borderRadius: 20,
            padding: "28px 24px", boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
          }}
        >
          {children}
        </div>
      </div>
      <LegalFooter />
    </div>
  );
}

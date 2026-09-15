"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Notice } from "@/components/notice";
import { OAuthButtons } from "@/components/auth/oauth-buttons";

const inputStyle: React.CSSProperties = {
  width: "100%", height: 44, borderRadius: 12, padding: "0 14px", marginTop: 6,
  background: "#181a26", border: "1px solid #292c3d", color: "#f7f7fb",
  fontSize: "0.9rem", fontFamily: "Heebo, sans-serif", direction: "ltr", textAlign: "right",
};

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? undefined;
  const oauthError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    oauthError ? "ההתחברות עם הספק נכשלה. נסו שוב." : null,
  );
  const [checkEmail, setCheckEmail] = useState(false);
  const [resent, setResent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "sign-up" && password !== confirmPassword) {
      setError("הסיסמאות לא תואמות.");
      return;
    }
    if (mode === "sign-up" && !agreedToTerms) {
      setError("יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי להמשיך.");
      return;
    }

    setSubmitting(true);
    try {
      const endpoint = mode === "sign-in" ? "/api/auth/sign-in" : "/api/auth/sign-up";
      const body = mode === "sign-in" ? { email, password } : { email, password, agreedToTerms };
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await r.json()) as { ok?: boolean; needsConfirmation?: boolean; error?: string };
      if (!r.ok) {
        setError(mode === "sign-in" ? "אימייל או סיסמה שגויים." : "לא הצלחנו ליצור את החשבון. נסו שוב.");
        return;
      }
      if (mode === "sign-up" && data.needsConfirmation) {
        setCheckEmail(true);
        return;
      }
      // A full navigation, not router.push() — the destination page (/vestory_app)
      // has a different CSP (allows PostHog's hosts) than /login. A client-side
      // soft nav keeps enforcing the CSP from the page that's actually loaded,
      // so PostHog would silently get blocked until a real document load happens.
      window.location.href = next && next.startsWith("/") ? next : "/vestory_app";
    } finally {
      setSubmitting(false);
    }
  }

  async function resendConfirmation() {
    await fetch("/api/auth/resend-confirmation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setResent(true);
  }

  if (checkEmail) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "center" }}>
        <h2 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#f7f7fb" }}>בדקו את תיבת המייל</h2>
        <p style={{ fontSize: "0.88rem", color: "#9b9dae", lineHeight: 1.7 }}>
          שלחנו קישור אימות אל {email}. יש ללחוץ עליו כדי להפעיל את החשבון.
        </p>
        <button
          onClick={() => void resendConfirmation()}
          disabled={resent}
          style={{
            background: "none", border: "1px solid #292c3d", borderRadius: 10, height: 40,
            color: resent ? "#565968" : "#7b6ff5", fontSize: "0.85rem", fontWeight: 600,
            cursor: resent ? "default" : "pointer", fontFamily: "Heebo, sans-serif",
          }}
        >
          {resent ? "המייל נשלח שוב" : "לא קיבלתי מייל — שליחה חוזרת"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#f7f7fb", textAlign: "center" }}>
        {mode === "sign-in" ? "התחברות" : "יצירת חשבון"}
      </h2>

      {error && <Notice tone="error">{error}</Notice>}

      <label style={{ fontSize: "0.8rem", color: "#9b9dae" }}>
        אימייל
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
      </label>

      <label style={{ fontSize: "0.8rem", color: "#9b9dae" }}>
        סיסמה
        <input
          type="password" required minLength={8} value={password}
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          onChange={(e) => setPassword(e.target.value)} style={inputStyle}
        />
      </label>

      {mode === "sign-up" && (
        <label style={{ fontSize: "0.8rem", color: "#9b9dae" }}>
          אימות סיסמה
          <input type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={inputStyle} />
        </label>
      )}

      {mode === "sign-in" && (
        <a href="/reset-password" style={{ fontSize: "0.8rem", color: "#7b6ff5", textAlign: "left", textDecoration: "none" }}>
          שכחתם סיסמה?
        </a>
      )}

      {mode === "sign-up" && (
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: "0.78rem", color: "#9b9dae", lineHeight: 1.6, cursor: "pointer" }}>
          <input
            type="checkbox" required checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            style={{ marginTop: 3, flexShrink: 0, width: 15, height: 15, accentColor: "#7b6ff5" }}
          />
          <span>
            קראתי ואני מסכים/ה ל<a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "#7b6ff5" }}>תנאי השימוש</a>{" "}
            ול<a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "#7b6ff5" }}>מדיניות הפרטיות</a>
          </span>
        </label>
      )}

      <button
        type="submit"
        disabled={submitting || (mode === "sign-up" && !agreedToTerms)}
        style={{
          height: 46, borderRadius: 12, border: "none", color: "#fff", fontSize: "0.92rem", fontWeight: 700,
          background: "linear-gradient(130deg, #7b6ff5, #5b8af0)",
          cursor: submitting || (mode === "sign-up" && !agreedToTerms) ? "not-allowed" : "pointer",
          opacity: submitting ? 0.7 : mode === "sign-up" && !agreedToTerms ? 0.45 : 1,
          fontFamily: "Heebo, sans-serif",
        }}
      >
        {submitting ? "רגע…" : mode === "sign-in" ? "התחברות" : "יצירת חשבון"}
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
        <div style={{ flex: 1, height: 1, background: "#292c3d" }} />
        <span style={{ fontSize: "0.75rem", color: "#565968" }}>או</span>
        <div style={{ flex: 1, height: 1, background: "#292c3d" }} />
      </div>

      <OAuthButtons next={next} disabled={mode === "sign-up" && !agreedToTerms} />

      <p style={{ fontSize: "0.82rem", color: "#9b9dae", textAlign: "center", marginTop: 4 }}>
        {mode === "sign-in" ? (
          <>אין לכם חשבון? <a href="/signup" style={{ color: "#7b6ff5", textDecoration: "none" }}>יצירת חשבון</a></>
        ) : (
          <>יש לכם כבר חשבון? <a href="/login" style={{ color: "#7b6ff5", textDecoration: "none" }}>התחברות</a></>
        )}
      </p>
    </form>
  );
}

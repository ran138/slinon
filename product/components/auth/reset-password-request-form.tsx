"use client";

import { useState } from "react";
import { Notice } from "@/components/notice";

const inputStyle: React.CSSProperties = {
  width: "100%", height: 44, borderRadius: 12, padding: "0 14px", marginTop: 6,
  background: "#181a26", border: "1px solid #292c3d", color: "#f7f7fb",
  fontSize: "0.9rem", fontFamily: "Heebo, sans-serif", direction: "ltr", textAlign: "right",
};

export function ResetPasswordRequestForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "center" }}>
        <h2 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#f7f7fb" }}>בדקו את תיבת המייל</h2>
        <Notice>אם קיים חשבון עם הכתובת הזו, שלחנו אליה קישור לאיפוס הסיסמה.</Notice>
        <a href="/login" style={{ fontSize: "0.85rem", color: "#7b6ff5", textDecoration: "none" }}>חזרה להתחברות</a>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#f7f7fb", textAlign: "center" }}>איפוס סיסמה</h2>
      <p style={{ fontSize: "0.82rem", color: "#9b9dae", textAlign: "center" }}>נשלח לכם קישור לאיפוס הסיסמה באימייל.</p>
      <label style={{ fontSize: "0.8rem", color: "#9b9dae" }}>
        אימייל
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
      </label>
      <button
        type="submit"
        disabled={submitting}
        style={{
          height: 46, borderRadius: 12, border: "none", color: "#fff", fontSize: "0.92rem", fontWeight: 700,
          background: "linear-gradient(130deg, #7b6ff5, #5b8af0)", cursor: submitting ? "default" : "pointer",
          opacity: submitting ? 0.7 : 1, fontFamily: "Heebo, sans-serif",
        }}
      >
        {submitting ? "רגע…" : "שליחת קישור"}
      </button>
      <a href="/login" style={{ fontSize: "0.82rem", color: "#7b6ff5", textAlign: "center", textDecoration: "none" }}>חזרה להתחברות</a>
    </form>
  );
}

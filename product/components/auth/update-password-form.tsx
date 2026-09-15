"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/notice";

const inputStyle: React.CSSProperties = {
  width: "100%", height: 44, borderRadius: 12, padding: "0 14px", marginTop: 6,
  background: "#181a26", border: "1px solid #292c3d", color: "#f7f7fb",
  fontSize: "0.9rem", fontFamily: "Heebo, sans-serif", direction: "ltr", textAlign: "right",
};

export function UpdatePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("הסיסמאות לא תואמות.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!r.ok) {
        setError("לא הצלחנו לעדכן את הסיסמה. ייתכן שהקישור פג תוקף — בקשו קישור חדש.");
        return;
      }
      router.push("/vestory_app");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#f7f7fb", textAlign: "center" }}>סיסמה חדשה</h2>
      {error && <Notice tone="error">{error}</Notice>}
      <label style={{ fontSize: "0.8rem", color: "#9b9dae" }}>
        סיסמה חדשה
        <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
      </label>
      <label style={{ fontSize: "0.8rem", color: "#9b9dae" }}>
        אימות סיסמה
        <input type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={inputStyle} />
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
        {submitting ? "רגע…" : "עדכון סיסמה"}
      </button>
    </form>
  );
}

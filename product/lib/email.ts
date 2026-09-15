import "server-only";
import { Resend } from "resend";

let client: Resend | null = null;
function getClient() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  if (!client) client = new Resend(apiKey);
  return client;
}

export async function sendPodcastReadyEmail(params: { to: string; briefId: string; title: string | null }) {
  const resend = getClient();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const appUrl = process.env.APP_URL?.trim();
  if (!resend || !from || !appUrl) return;

  const listenUrl = `${appUrl}/vestory_app?brief=${params.briefId}`;
  const subject = params.title ? `הפודקאסט שלך מוכן: ${params.title}` : "הפודקאסט שלך מוכן";

  try {
    await resend.emails.send({
      from,
      to: params.to,
      subject,
      html: `
        <div dir="rtl" lang="he" style="font-family:Heebo,Arial,sans-serif;background:#080910;color:#f7f7fb;padding:32px 24px;">
          <h1 style="font-size:1.3rem;margin:0 0 12px;">הפודקאסט שלך מוכן להאזנה 🎧</h1>
          ${params.title ? `<p style="font-size:1rem;color:#c4c4d6;margin:0 0 20px;">${params.title}</p>` : ""}
          <a href="${listenUrl}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:linear-gradient(130deg,#7b6ff5,#5b8af0);color:#fff;text-decoration:none;font-weight:700;">להאזנה עכשיו ←</a>
          <p style="font-size:0.78rem;color:#565968;margin-top:28px;">
            לא רוצים לקבל את ההודעות האלה? אפשר לכבות אותן בהעדפות באפליקציה.
          </p>
        </div>
      `,
    });
  } catch (error) {
    // A failed notification email must never fail the generation job itself —
    // the podcast is already done and saved; log and move on.
    console.error("sendPodcastReadyEmail failed", error);
  }
}

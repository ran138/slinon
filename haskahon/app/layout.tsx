import type { Metadata } from "next";
import "./globals.css";
import { WebMCPTools } from "@/components/webmcp-tools";

export const metadata: Metadata = {
  title: "חסכהון — הבריף הפיננסי האישי שלך",
  description: "חדשות השוק שנוגעות לתיק ולתחומי העניין שלך, בבריף קולי בעברית.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className="antialiased"><WebMCPTools />{children}</body>
    </html>
  );
}

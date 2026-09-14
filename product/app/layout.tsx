import type { Metadata } from "next";
import "./globals.css";
import { WebMCPTools } from "@/components/webmcp-tools";

export const metadata: Metadata = {
  title: "VESTORY — עדכון פיננסי אישי בעברית",
  description: "חדשות השוק שנוגעות לתיק ולתחומי העניין שלך, בפודקאסט קולי בעברית.",
  icons: {
    icon: "/home/assets/slinon-logo.png",
    shortcut: "/home/assets/slinon-logo.png",
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

"use client";

import { Sun, BriefcaseBusiness, Settings2, History, LogOut } from "lucide-react";
import { Logo } from "@/components/logo";

export type AppDestination = "dashboard" | "settings-portfolio" | "history" | "player" | "sources";
export function AppSidebar({ active, email, plan, onNav, onPreferences, onSignOut }: {
  active: "dashboard" | "settings-portfolio"; email: string | null; plan: "daily" | "weekly";
  onNav: (screen: AppDestination) => void; onPreferences: () => void; onSignOut: () => void;
}) {
  return (
    <aside className="today-sidebar" dir="rtl" aria-label="ניווט ראשי">
      <div className="today-brand" dir="ltr"><strong>VESTORY</strong><span dir="rtl">כל מה שחשוב להשקעות שלך</span></div>
      <nav>{[
        { id: "dashboard" as const, label: "היום", icon: Sun }, { id: "settings-portfolio" as const, label: "המעקב שלי", icon: BriefcaseBusiness },
        { id: "preferences" as const, label: "העדפות", icon: Settings2 }, { id: "history" as const, label: "היסטוריה", icon: History },
      ].map(({ id, label, icon: Icon }) => <button key={id} className={id === active ? "active" : ""} aria-current={id === active ? "page" : undefined} onClick={() => id === "preferences" ? onPreferences() : onNav(id)}><Icon size={23}/><span>{label}</span></button>)}</nav>
      <div className="today-sidebar-bottom">
        <button className="today-account" onClick={onPreferences}><span className="today-avatar">{email?.[0]?.toUpperCase() ?? "V"}</span><span><strong>החשבון שלי</strong><small>{plan === "daily" ? "מסלול יומי" : "מסלול שבועי"}</small></span></button>
        {email && <bdi className="today-email ph-mask-text" dir="ltr">{email}</bdi>}
        <button className="today-logout" onClick={onSignOut}><LogOut size={16}/>התנתקות</button>
        <div className="today-powered"><Logo size="lg"/><span>מניעים אותך קדימה</span></div>
      </div>
    </aside>
  );
}


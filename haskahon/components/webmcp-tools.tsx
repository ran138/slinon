"use client";

import { useEffect } from "react";

type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown | Promise<unknown>;
};

declare global {
  interface Document {
    modelContext?: { registerTool(tool: ToolDefinition, options?: { signal?: AbortSignal }): void | Promise<void> };
  }
}

export function WebMCPTools() {
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const emptySchema = { type: "object", properties: {}, additionalProperties: false };
    void Promise.resolve(context.registerTool({
      name: "read_haskahon_profile",
      title: "קריאת פרופיל חסכהון",
      description: "Read the locally stored portfolio, watchlist, interests, and target brief length without changing them.",
      inputSchema: emptySchema,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute() {
        const response = await fetch("/api/profile");
        if (!response.ok) throw new Error("profile_unavailable");
        return response.json();
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    void Promise.resolve(context.registerTool({
      name: "start_haskahon_brief",
      title: "יצירת בריף חדש",
      description: "Start one on-demand personalized brief from the currently confirmed local profile and navigate to its progress screen.",
      inputSchema: emptySchema,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute() {
        const response = await fetch("/api/briefs", { method: "POST" });
        const result = await response.json() as { id?: string; error?: string };
        if (!response.ok || !result.id) throw new Error(result.error ?? "generation_failed");
        window.location.assign("/generate/" + result.id);
        return { id: result.id, status: "queued" };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);
  return null;
}

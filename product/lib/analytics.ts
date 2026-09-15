"use client";
import posthog from "posthog-js";

let initialized = false;

/**
 * No-ops entirely when the env vars aren't set — safe to call
 * unconditionally, including in environments where PostHog isn't
 * configured (local dev without a key, etc.).
 */
export function initAnalytics() {
  if (initialized) return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key || !host) return;

  posthog.init(key, {
    api_host: host,
    // Opts into PostHog's current recommended baseline behavior (capture,
    // autocapture, etc.) — without this, newer SDK versions may not
    // actually start capturing anything even with an otherwise-valid config.
    defaults: "2026-05-30",
    // Only creates a billable "person" profile once we've identified a
    // real logged-in user (see identifyUser below) — every /vestory_app
    // visitor is already authenticated by the time this runs (proxy.ts
    // gates the route), so in practice this fires for every real session,
    // just avoids ever billing for a stray anonymous/pre-auth pageview.
    person_profiles: "identified_only",
    session_recording: {
      // Elements carrying this class have their text redacted in
      // recordings (still visible as a same-size blur, not blank) — used
      // on portfolio holdings/amounts. See components/vestory-app.tsx.
      maskTextSelector: ".ph-mask-text",
    },
  });
  initialized = true;
}

export function identifyUser(email: string) {
  if (!initialized) return;
  posthog.identify(email, { email });
}

/** Call on sign-out so a shared browser doesn't keep the previous user's identity. */
export function resetAnalytics() {
  if (!initialized) return;
  posthog.reset();
}

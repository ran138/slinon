import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/marketing/index.html" },
        { source: "/about", destination: "/about/index.html" },
        { source: "/support.js", destination: "/about/support.js" },
        { source: "/assets/slinon-logo.png", destination: "/about/assets/slinon-logo.png" },
        { source: "/styles.css", destination: "/marketing/styles.css" },
        { source: "/app.js", destination: "/marketing/app.js" },
        { source: "/og-image.png", destination: "/marketing/og-image.png" },
        { source: "/og-image.svg", destination: "/marketing/og-image.svg" },
        { source: "/site/assets/slinon-logo.png", destination: "/about/assets/slinon-logo.png" },
        { source: "/demo", destination: "/marketing/demo/index.html" },
        { source: "/examples", destination: "/marketing/examples/index.html" },
        { source: "/how-it-works", destination: "/marketing/how-it-works/index.html" },
        { source: "/trust", destination: "/marketing/trust/index.html" },
        { source: "/compare", destination: "/marketing/compare/index.html" },
        { source: "/compare/ai", destination: "/marketing/compare/ai/index.html" },
        { source: "/compare/news", destination: "/marketing/compare/news/index.html" },
        { source: "/compare/newsletters", destination: "/marketing/compare/newsletters/index.html" },
        { source: "/compare/podcasts", destination: "/marketing/compare/podcasts/index.html" },
        { source: "/marketing", destination: "/marketing/index.html" },
        { source: "/marketing/demo", destination: "/marketing/demo/index.html" },
        { source: "/marketing/examples", destination: "/marketing/examples/index.html" },
        { source: "/marketing/how-it-works", destination: "/marketing/how-it-works/index.html" },
        { source: "/marketing/trust", destination: "/marketing/trust/index.html" },
        { source: "/marketing/compare", destination: "/marketing/compare/index.html" },
        { source: "/marketing/compare/ai", destination: "/marketing/compare/ai/index.html" },
        { source: "/marketing/compare/news", destination: "/marketing/compare/news/index.html" },
        { source: "/marketing/compare/newsletters", destination: "/marketing/compare/newsletters/index.html" },
        { source: "/marketing/compare/podcasts", destination: "/marketing/compare/podcasts/index.html" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async redirects() {
    return [
      { source: "/app", destination: "/vestory_app", permanent: true },
      { source: "/app/1", destination: "/vestory_app", permanent: true },
      { source: "/app/:path*", destination: "/vestory_app/:path*", permanent: true },
    ];
  },
  async headers() {
    const securityHeaders = [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
    ];
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        source: "/",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" }],
      },
      {
        source: "/vestory_app/:path*",
        // connect-src includes PostHog's ingest hosts (both regions, since
        // the project may be created in either) — its session-replay/
        // analytics SDK sends data directly from the browser, unlike our
        // server-mediated Supabase auth calls.
        headers: [{ key: "Content-Security-Policy", value: `default-src 'self'; script-src 'self' 'unsafe-inline' https://us-assets.i.posthog.com https://eu-assets.i.posthog.com${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self' https://us.i.posthog.com https://us-assets.i.posthog.com https://eu.i.posthog.com https://eu-assets.i.posthog.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` }],
      },
      {
        source: "/login",
        headers: [{ key: "Content-Security-Policy", value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` }],
      },
      {
        source: "/signup",
        headers: [{ key: "Content-Security-Policy", value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` }],
      },
      {
        source: "/reset-password/:path*",
        headers: [{ key: "Content-Security-Policy", value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` }],
      },
      {
        source: "/marketing/:path*",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" }],
      },
    ];
  },
};

export default nextConfig;

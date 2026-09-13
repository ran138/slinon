import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/home/index.html" },
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
        headers: [{ key: "Content-Security-Policy", value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` }],
      },
      {
        source: "/marketing/:path*",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" }],
      },
    ];
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */

// FID-2026-0904-013 §2 — the staged-rollout switch (Law 13: ONE owner).
// Phase A (true): the full policy ships as Content-Security-Policy-Report-Only
//   sitewide — browsers evaluate + report violations to /api/csp-report and
//   block nothing. Zero user-visible behavior change is possible.
// Phase B (false): the same policy becomes the enforced Content-Security-Policy
//   (old frame-ancestors fragment folded in). Gate: ≥3 days of report traffic
//   reviewed, zero first-party violations in the trailing 48h, observed
//   legitimate article-image hosts added to img-src.
const CSP_REPORT_ONLY = true;

// Client-side Supabase auth (register/sign-in/session) fetches the project
// host from the browser (lib/supabase/client.ts) — connect-src must include
// it or auth breaks. Derived from env with a fallback to the current ref.
// (Plain JS: .mjs configs are parsed as JavaScript, no TS annotations.)
function supabaseOrigin() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function buildCsp(isDev) {
  const supabase =
    supabaseOrigin() ?? "https://xunlxdvlhfxokxjnxgrp.supabase.co";
  // Host-allowlist policy, NOT nonce-based: nonces force dynamic rendering
  // for every page (official Next.js CSP guide) and would reverse FID-012's
  // ISR completion. Directive rationale lives in the FID §1.
  return [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src 'self' ${supabase}`,
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src https://www.youtube-nocookie.com",
    "img-src 'self' data: https://i.ytimg.com https://opengraph.githubassets.com",
    "media-src 'none'",
    "object-src 'none'",
    // 'unsafe-inline' in script-src is the documented honest trade-off: the
    // alternatives (nonces / experimental SRI) both conflict with the site's
    // prerendered page model. 'unsafe-eval' is dev-only (React debug stacks).
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const nextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
  // Security headers (FID-2026-0904-012 item 1 + FID-2026-0904-013).
  // Static, sitewide. During phase A the enforced header stays the minimal
  // frame-ancestors fragment from FID-012 while the full policy reports —
  // the two coexist by design (browsers intersect enforcement across CSP
  // headers; values agree, so behavior is unchanged).
  async headers() {
    const isDev = process.env.NODE_ENV === "development";
    const policy = `${buildCsp(isDev)}; report-uri /api/csp-report`;
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          CSP_REPORT_ONLY
            ? { key: "Content-Security-Policy-Report-Only", value: policy }
            : { key: "Content-Security-Policy", value: policy },
          ...(CSP_REPORT_ONLY
            ? [
                {
                  key: "Content-Security-Policy",
                  value: "frame-ancestors 'none'",
                },
              ]
            : []),
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
    ],
  },
};

export default nextConfig;

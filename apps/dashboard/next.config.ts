import path from "node:path";
import type { NextConfig } from "next";

// Security headers — dashboard.md §5C. Applied to every response via
// next.config's headers() rather than hand-rolled per-route, since Next
// already funnels every request (page, route handler, static asset) through
// this single hook.
//
// `script-src`/`style-src` stay relaxed with 'unsafe-inline' in development
// only: Next's dev server (Fast Refresh/HMR) injects inline scripts and
// styles that a strict CSP would otherwise block. The production build never
// needs 'unsafe-inline' for scripts — React ships no inline event handlers,
// and Next's own bootstrap runs from hashed /_next/static/* files.
const isDev = process.env["NODE_ENV"] !== "production";

const securityHeaders: { key: string; value: string }[] = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "img-src 'self' https://cdn.discordapp.com data:",
      // Fonts are self-hosted via next/font (see app/layout.tsx) — no
      // external fonts.googleapis.com/gstatic.com origin needed, unlike the
      // old dashboard's `@import url(fonts.googleapis.com/...)`.
      `style-src 'self' 'unsafe-inline'`,
      "font-src 'self' data:",
      `script-src 'self'${isDev ? " 'unsafe-inline' 'unsafe-eval'" : ""}`,
      "connect-src 'self'" + (isDev ? " ws:" : ""),
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Server Actions already enforce a same-origin check (Origin vs Host) on
  // every mutating call — this is Next's built-in CSRF defense for actions,
  // per dashboard.md §5's CSRF requirement. We intentionally do not set
  // `experimental.serverActions.allowedOrigins` here: leaving it unset keeps
  // the check strictly same-origin, which is what a self-hosted dashboard
  // behind one origin wants. Do not hand-roll a CSRF token system on top.
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    // Multiple bun.lock files exist above apps/dashboard (this worktree's
    // own repo root, plus sibling worktrees / the primary checkout under
    // .claude/worktrees/) — Turbopack's automatic root inference picks
    // whichever it finds first walking up, which can select the wrong
    // repo copy entirely and then fail to resolve workspace packages like
    // @lumi/contracts. Pin it explicitly to this repo's own root.
    root: path.join(import.meta.dirname, "../.."),
  },
};

export default nextConfig;

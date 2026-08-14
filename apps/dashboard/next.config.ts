import path from "node:path";
import type { NextConfig } from "next";

// Content-Security-Policy is deliberately not here — it needs a per-request
// nonce on the request headers, which only the proxy can set. See src/proxy.ts.
const securityHeaders: { key: string; value: string }[] = [
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
  // This repo maintains its own AGENTS.md; next dev otherwise writes over it.
  agentRules: false,
  // Leaving `experimental.serverActions.allowedOrigins` unset keeps Next's
  // built-in Server Action CSRF check strictly same-origin.
  headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    // Pinned: another bun.lock anywhere above this directory makes Turbopack's
    // automatic root inference pick the wrong repo copy.
    root: path.join(import.meta.dirname, "../.."),
  },
};

export default nextConfig;

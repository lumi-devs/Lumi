import { NextResponse, type NextRequest } from "next/server";

// The CSP must live here, not in next.config.ts: Next only nonces its inline RSC
// flight scripts when it reads the header off the *incoming request*, and a
// response header set by next.config.ts is invisible to the renderer.
const isDev = process.env.NODE_ENV !== "production";

function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    "img-src 'self' https://cdn.discordapp.com data:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-inline' 'unsafe-eval'" : ""}`,
    `connect-src 'self'${isDev ? " ws:" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export function proxy(request: NextRequest): NextResponse {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = btoa(String.fromCharCode(...bytes));
  const csp = contentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

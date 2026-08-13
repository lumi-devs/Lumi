import { NextResponse, type NextRequest } from "next/server";
import { getClientIp } from "#/lib/client-ip";
import { isRateLimited } from "#/lib/rate-limit";

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

/**
 * NextAuth's own endpoints are hit directly by the browser during the OAuth
 * dance, so the rate limit on the /login server action never sees them. Only
 * the credential-bearing/state-changing ones are covered: /api/auth/session and
 * /api/auth/csrf are polled by the client on ordinary page loads and limiting
 * those would break normal use.
 */
const RATE_LIMITED_AUTH_PATH = /^\/api\/auth\/(?:signin|callback)(?:\/|$)/;

// One sign-in costs ~2 requests (signin POST, then the callback redirect), so
// this is ~10 full flows per minute per IP — well clear of a human retrying,
// and still a hard ceiling on callback/state brute-forcing. Matches the
// 10-per-minute budget the /login server action already applies.
const AUTH_RATE_LIMIT = 20;
const AUTH_RATE_WINDOW_MS = 60_000;

export function isRateLimitedAuthPath(pathname: string): boolean {
  return RATE_LIMITED_AUTH_PATH.test(pathname);
}

async function tooManyAuthRequests(
  request: NextRequest,
): Promise<NextResponse | null> {
  if (!isRateLimitedAuthPath(request.nextUrl.pathname)) return null;

  const ip = getClientIp(request.headers);
  const limited = await isRateLimited(
    `auth-endpoint:${ip}`,
    AUTH_RATE_LIMIT,
    AUTH_RATE_WINDOW_MS,
  );
  if (!limited) return null;

  return new NextResponse("Too Many Requests", {
    status: 429,
    headers: {
      "retry-after": String(AUTH_RATE_WINDOW_MS / 1000),
      "cache-control": "no-store",
    },
  });
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const rejected = await tooManyAuthRequests(request);
  if (rejected) return rejected;

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
    // Unconditional, and listed first: the `missing` clause on the entry below
    // is a client-supplied opt-out (any caller can send `purpose: prefetch`),
    // which would otherwise be a free bypass of the auth rate limit.
    "/api/auth/:path*",
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

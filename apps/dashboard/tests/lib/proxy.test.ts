import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy, isRateLimitedAuthPath, config } from "#/proxy";

// Each test uses a distinct IP: the limiter lives in a module-global map, so
// budgets carry across cases within a file.
function request(path: string, ip: string): NextRequest {
  return new NextRequest(`https://dash.example.com${path}`, {
    headers: { "x-real-ip": ip },
  });
}

describe("isRateLimitedAuthPath", () => {
  it("covers the endpoints the browser hits directly during the OAuth dance", () => {
    expect(isRateLimitedAuthPath("/api/auth/signin")).toBe(true);
    expect(isRateLimitedAuthPath("/api/auth/signin/discord")).toBe(true);
    expect(isRateLimitedAuthPath("/api/auth/callback/discord")).toBe(true);
  });

  it("leaves the reads that ordinary page loads poll alone", () => {
    expect(isRateLimitedAuthPath("/api/auth/session")).toBe(false);
    expect(isRateLimitedAuthPath("/api/auth/csrf")).toBe(false);
    expect(isRateLimitedAuthPath("/api/auth/providers")).toBe(false);
    expect(isRateLimitedAuthPath("/")).toBe(false);
    expect(isRateLimitedAuthPath("/guild/123")).toBe(false);
  });

  it("does not match a path that merely starts with the same prefix", () => {
    expect(isRateLimitedAuthPath("/api/auth/signinsomething")).toBe(false);
    expect(isRateLimitedAuthPath("/api/auth/callbackish")).toBe(false);
  });
});

describe("proxy", () => {
  it("sets a CSP with a nonce on a normal request", async () => {
    const response = await proxy(request("/", "203.0.113.1"));
    const csp = response.headers.get("content-security-policy");
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
    expect(response.status).toBe(200);
  });

  it("429s an auth endpoint once the per-IP budget is spent", async () => {
    const ip = "203.0.113.2";
    for (let i = 0; i < 20; i++) {
      const allowed = await proxy(request("/api/auth/callback/discord", ip));
      expect(allowed.status).toBe(200);
    }

    const blocked = await proxy(request("/api/auth/callback/discord", ip));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("60");
  });

  it("budgets per IP rather than globally", async () => {
    const spent = "203.0.113.3";
    for (let i = 0; i < 21; i++) await proxy(request("/api/auth/signin", spent));
    expect((await proxy(request("/api/auth/signin", spent))).status).toBe(429);

    const fresh = await proxy(request("/api/auth/signin", "203.0.113.4"));
    expect(fresh.status).toBe(200);
  });

  it("never limits the session endpoint, however often it is polled", async () => {
    const ip = "203.0.113.5";
    for (let i = 0; i < 50; i++) {
      const response = await proxy(request("/api/auth/session", ip));
      expect(response.status).toBe(200);
    }
  });

});

describe("config.matcher", () => {
  it("matches /api/auth unconditionally, so a client-supplied prefetch header can't skip the limiter", () => {
    // The other entry opts out via `missing: [next-router-prefetch, purpose]`,
    // both of which any caller can set. A bare string entry has no such escape.
    expect(config.matcher).toContain("/api/auth/:path*");
  });
});

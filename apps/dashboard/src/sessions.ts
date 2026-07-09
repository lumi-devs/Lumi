import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config, SESSION_TTL_MS } from "./config.js";
import type { Session } from "./types.js";

const COOKIE_NAME = "lumi_dash";
const STATE_COOKIE = "lumi_oauth_state";

// In-memory session store. Sessions are ephemeral by design — a dashboard
// restart simply asks admins to log in again. Swap for Redis if horizontal
// scaling of the dashboard itself is ever needed.
const store = new Map<string, Session>();

// ── Cookie signing ───────────────────────────────────────────────────────────

function sign(value: string): string {
  const sig = createHmac("sha256", config.sessionSecret)
    .update(value)
    .digest("base64url");
  return `${value}.${sig}`;
}

function unsign(signed: string): string | null {
  const dot = signed.lastIndexOf(".");
  if (dot < 0) return null;
  const value = signed.slice(0, dot);
  const expected = Buffer.from(sign(value));
  const actual = Buffer.from(signed);
  if (expected.length !== actual.length) return null;
  return timingSafeEqual(expected, actual) ? value : null;
}

function serializeCookie(
  name: string,
  value: string,
  maxAgeSec: number,
): string {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ];
  if (config.secureCookies) parts.push("Secure");
  return parts.join("; ");
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export function createSession(data: Omit<Session, "expiresAt">): string {
  const id = randomBytes(32).toString("base64url");
  store.set(id, { ...data, expiresAt: Date.now() + SESSION_TTL_MS });
  return id;
}

export function readSession(cookieHeader: string | null): Session | null {
  const signed = readCookie(cookieHeader, COOKIE_NAME);
  if (!signed) return null;
  const id = unsign(signed);
  if (!id) return null;
  const session = store.get(id);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    store.delete(id);
    return null;
  }
  return session;
}

export function destroySession(cookieHeader: string | null): void {
  const signed = readCookie(cookieHeader, COOKIE_NAME);
  const id = signed && unsign(signed);
  if (id) store.delete(id);
}

export function sessionCookie(id: string): string {
  return serializeCookie(
    COOKIE_NAME,
    sign(id),
    Math.floor(SESSION_TTL_MS / 1000),
  );
}

export function clearSessionCookie(): string {
  return serializeCookie(COOKIE_NAME, "", 0);
}

// ── OAuth CSRF state ─────────────────────────────────────────────────────────

export function issueState(): { state: string; cookie: string } {
  const state = randomBytes(16).toString("base64url");
  return { state, cookie: serializeCookie(STATE_COOKIE, sign(state), 600) };
}

export function verifyState(
  cookieHeader: string | null,
  received: string | null,
): boolean {
  const signed = readCookie(cookieHeader, STATE_COOKIE);
  const expected = signed && unsign(signed);
  return Boolean(received && expected && received === expected);
}

export function clearStateCookie(): string {
  return serializeCookie(STATE_COOKIE, "", 0);
}

/** Periodically drop expired sessions so the store doesn't grow unbounded. */
export function startSessionReaper(): ReturnType<typeof setInterval> {
  return setInterval(
    () => {
      const now = Date.now();
      for (const [id, session] of store)
        if (now > session.expiresAt) store.delete(id);
    },
    1000 * 60 * 10,
  ).unref();
}

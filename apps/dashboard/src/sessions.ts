import { randomBytes, timingSafeEqual } from "node:crypto";
import { isNullish } from "@sapphire/utilities";
import { config, SESSION_TTL_MS } from "./config.js";
import type { Session } from "./types.js";

const COOKIE_NAME = "lumi_dash";
const STATE_COOKIE = "lumi_oauth_state";

/**
 * Server-side session store. The session ID stored in the cookie is a
 * 32-byte (256-bit) cryptographically random opaque token — knowing the ID
 * is the credential. No signing is required because brute-forcing or guessing
 * a 256-bit random value is computationally infeasible.
 */
const store = new Map<string, Session>();

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

/** Constant-time string comparison to prevent timing attacks. */
function safeCompareStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createSession(data: Omit<Session, "expiresAt">): string {
  const id = randomBytes(32).toString("base64url");
  store.set(id, { ...data, expiresAt: Date.now() + SESSION_TTL_MS });
  return id;
}

export function readSession(cookieHeader: string | null): Session | null {
  const id = readCookie(cookieHeader, COOKIE_NAME);
  if (!id) return null;
  const session = store.get(id);
  if (isNullish(session)) return null;
  if (Date.now() > session.expiresAt) {
    store.delete(id);
    return null;
  }
  return session;
}

export function destroySession(cookieHeader: string | null): void {
  const id = readCookie(cookieHeader, COOKIE_NAME);
  if (id) store.delete(id);
}

export function sessionCookie(id: string): string {
  return serializeCookie(COOKIE_NAME, id, Math.floor(SESSION_TTL_MS / 1000));
}

export function clearSessionCookie(): string {
  return serializeCookie(COOKIE_NAME, "", 0);
}

export function issueState(): { state: string; cookie: string } {
  const state = randomBytes(16).toString("base64url");
  return { state, cookie: serializeCookie(STATE_COOKIE, state, 600) };
}

export function verifyState(
  cookieHeader: string | null,
  received: string | null,
): boolean {
  const expected = readCookie(cookieHeader, STATE_COOKIE);
  if (!received || !expected) return false;
  return safeCompareStrings(received, expected);
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

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Cookies } from "@sveltejs/kit";
import { z } from "zod";
import { serverConfig } from "./env";
import { dashboardKey, getRedis } from "./redis";

export const SessionCookie = "lumi_dashboard_session";

const SessionSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  displayName: z.string().nullable(),
  avatar: z.string().nullable(),
  accessToken: z.string().min(1),
  refreshToken: z.string().nullable(),
  tokenExpiresAt: z.number(),
  csrfToken: z.string().min(16),
  createdAt: z.number(),
});

export type SessionRecord = z.infer<typeof SessionSchema>;

export interface LoadedSession {
  id: string;
  record: SessionRecord;
}

function hmac(input: string): string {
  return createHmac("sha256", serverConfig().sessionSecret)
    .update(input)
    .digest("base64url");
}

function sessionKey(id: string): string {
  return dashboardKey("session", hmac(`session-key:${id}`));
}

function signId(id: string): string {
  return hmac(`session-cookie:${id}`);
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookieValue(id: string): string {
  return `${id}.${signId(id)}`;
}

function parseCookieValue(value: string): string | null {
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(id)) return null;
  return safeEqual(signature, signId(id)) ? id : null;
}

export function newCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(
  record: Omit<SessionRecord, "csrfToken" | "createdAt">,
): Promise<{ id: string; record: SessionRecord }> {
  const id = randomBytes(32).toString("base64url");
  const full: SessionRecord = {
    ...record,
    csrfToken: newCsrfToken(),
    createdAt: Date.now(),
  };
  await getRedis().set(
    sessionKey(id),
    JSON.stringify(full),
    "EX",
    serverConfig().sessionTtlSeconds,
  );
  return { id, record: full };
}

export async function readSession(
  value: string | undefined,
): Promise<LoadedSession | null> {
  if (!value) return null;
  const id = parseCookieValue(value);
  if (!id) return null;

  const raw = await getRedis().get(sessionKey(id));
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await getRedis().del(sessionKey(id));
    return null;
  }

  const result = SessionSchema.safeParse(parsed);
  if (!result.success) {
    await getRedis().del(sessionKey(id));
    return null;
  }

  await getRedis().expire(sessionKey(id), serverConfig().sessionTtlSeconds);
  return { id, record: result.data };
}

export async function saveSession(
  id: string,
  record: SessionRecord,
): Promise<void> {
  await getRedis().set(
    sessionKey(id),
    JSON.stringify(record),
    "EX",
    serverConfig().sessionTtlSeconds,
  );
}

export async function destroySession(id: string): Promise<void> {
  await getRedis().del(sessionKey(id));
}

export function setSessionCookie(
  cookies: Cookies,
  id: string,
  secure = serverConfig().cookieSecure,
): void {
  cookies.set(SessionCookie, cookieValue(id), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: serverConfig().sessionTtlSeconds,
  });
}

export function clearSessionCookie(cookies: Cookies): void {
  cookies.delete(SessionCookie, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: serverConfig().cookieSecure,
  });
}

import { createHmac, timingSafeEqual } from "node:crypto";
import { envParseString } from "#lib/env.js";

/**
 * Signed, tamper-proof, expiring token embedded in the appeal link DMed on
 * ban/timeout - lets a punished user (who may have zero dashboard access)
 * reach the public `/appeal/[guildId]/[caseId]` route without a session.
 *
 * `${base64url(JSON payload)}.${base64url(HMAC-SHA256 signature)}`, signed
 * with a core-only secret (`APPEAL_TOKEN_SECRET`) that never leaves this
 * process - the dashboard forwards the opaque token string over RPC and this
 * module is the only place that ever verifies it, satisfying "verify
 * server-side on page load AND on submission" without a shared secret.
 */
export interface AppealTokenPayload {
  guildId: string;
  caseId: number;
  userId: string;
  /** Epoch ms. */
  exp: number;
}

const DefaultTtlMs = 14 * 24 * 60 * 60 * 1000;

function secret(): string {
  return envParseString("APPEAL_TOKEN_SECRET");
}

function sign(payloadB64: string): string {
  return createHmac("sha256", secret()).update(payloadB64).digest("base64url");
}

export function generateAppealToken(
  payload: Omit<AppealTokenPayload, "exp">,
  ttlMs = DefaultTtlMs,
): string {
  const full: AppealTokenPayload = { ...payload, exp: Date.now() + ttlMs };
  const payloadB64 = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

/** Returns the decoded payload if `token` is well-formed, unexpired, and its
 *  signature matches; `null` for anything else (never throws). */
export function verifyAppealToken(token: string): AppealTokenPayload | null {
  if (typeof token !== "string" || token.length === 0) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts as [string, string];

  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(sign(payloadB64), "base64url");
    actual = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  let payload: AppealTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof payload.guildId !== "string" ||
    typeof payload.userId !== "string" ||
    typeof payload.caseId !== "number" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  if (Date.now() > payload.exp) return null;

  return payload;
}

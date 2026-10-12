import { createHmac, timingSafeEqual } from "node:crypto";
import { envParseString } from "#src/lib/Env.js";
import { Time } from "#src/shared/Index.ts";

interface AppealTokenPayload {
  guildId: string;
  caseId: number;
  userId: string;

  exp: number;
}

const DefaultTtlMs = 14 * Time.Day;

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

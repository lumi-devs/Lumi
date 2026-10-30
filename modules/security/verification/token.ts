import { createHash, randomBytes } from "node:crypto";

export const VerificationTokenBytes = 32;
export const VerificationTokenLength = 43;
export const VerificationTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export interface VerificationTokenState {
  readonly expiresAt: Date | string | number;
  readonly usedAt?: Date | string | number | null;
}

export function generateVerificationToken(): string {
  return randomBytes(VerificationTokenBytes).toString("base64url");
}

export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isVerificationTokenUsable(
  token: VerificationTokenState,
  now: Date | number = new Date(),
): boolean {
  if (token.usedAt !== null && token.usedAt !== undefined) return false;

  const expiresAt =
    token.expiresAt instanceof Date
      ? token.expiresAt.getTime()
      : typeof token.expiresAt === "number"
        ? token.expiresAt
        : new Date(token.expiresAt).getTime();
  if (!Number.isFinite(expiresAt)) return false;

  const current = typeof now === "number" ? now : now.getTime();
  return expiresAt > current;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeWebBaseUrl(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !isHttpUrl(trimmed)) return null;
  return trimmed.replace(/\/+$/, "");
}

export function resolveWebBaseUrl(
  configured: string | null | undefined,
  envValue: string | null | undefined = process.env.WEB_BASE_URL,
): string | null {
  return normalizeWebBaseUrl(configured) ?? normalizeWebBaseUrl(envValue);
}

export function buildVerificationUrl(baseUrl: string, token: string): string {
  const normalized = normalizeWebBaseUrl(baseUrl);
  if (!normalized) throw new Error("Invalid web base URL");
  return `${normalized}/verify/${encodeURIComponent(token)}`;
}

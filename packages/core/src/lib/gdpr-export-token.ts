import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getGdprExportSigningSecret, getRpcInternalToken } from "#lib/env.js";

/**
 * Short-lived, HMAC-signed download token for a finished `GdprExportJob`.
 * Carries the job id and an expiry so `apps/api`'s download route can verify
 * it with no database round trip before ever reading the job row - the row
 * (and its `filePath`) is still the only source of truth for *what* gets
 * streamed; the token only proves "this caller was handed this job id by
 * `global.gdpr.export.status` within the last `ttlMs`".
 */
const TokenSeparator = ".";

export class GdprExportSigningKeyUnavailable extends Error {
  public constructor() {
    super(
      "GDPR export download tokens require GDPR_EXPORT_SIGNING_SECRET or RPC_INTERNAL_TOKEN to be set.",
    );
  }
}

/** Resolves the HMAC key, preferring a dedicated secret over the RPC bearer token. */
export function resolveGdprExportSigningKey(): string {
  const dedicated = getGdprExportSigningSecret();
  if (dedicated) return dedicated;
  const rpcToken = getRpcInternalToken();
  if (rpcToken) return rpcToken;
  throw new GdprExportSigningKeyUnavailable();
}

function sign(key: string, jobId: string, expiresAt: number): string {
  return createHmac("sha256", key)
    .update(`${jobId}${TokenSeparator}${expiresAt}`)
    .digest("hex");
}

export function signGdprExportToken(
  jobId: string,
  ttlMs: number,
  key: string = resolveGdprExportSigningKey(),
): string {
  const expiresAt = Date.now() + ttlMs;
  const mac = sign(key, jobId, expiresAt);
  return [jobId, expiresAt, mac].join(TokenSeparator);
}

export type GdprExportTokenVerification =
  | { valid: true; jobId: string }
  | { valid: false; reason: "malformed" | "expired" | "bad-signature" };

export function verifyGdprExportToken(
  token: string,
  key: string = resolveGdprExportSigningKey(),
): GdprExportTokenVerification {
  const parts = token.split(TokenSeparator);
  if (parts.length !== 3) return { valid: false, reason: "malformed" };
  const [jobId, expiresAtRaw, mac] = parts as [string, string, string];
  const expiresAt = Number(expiresAtRaw);
  if (!jobId || !Number.isFinite(expiresAt) || !mac) {
    return { valid: false, reason: "malformed" };
  }
  if (Date.now() > expiresAt) return { valid: false, reason: "expired" };

  // Compared via fixed-length SHA-256 digests (not the raw hex MACs) so
  // `timingSafeEqual` never sees mismatched buffer lengths - mirrors
  // `tokenMatches()` in `apps/api/src/rpc-http-server.ts`.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const expected = digest(sign(key, jobId, expiresAt));
  const presented = digest(mac);
  if (!timingSafeEqual(expected, presented)) {
    return { valid: false, reason: "bad-signature" };
  }
  return { valid: true, jobId };
}

export interface GdprExportJobRecord {
  id: string;
  userId: string;
  status: string;
  filePath: string | null;
  expiresAt: Date | null;
}

export async function findGdprExportJob(
  jobId: string,
): Promise<GdprExportJobRecord | null> {
  const { container } = await import("#lib/services.js");
  return (await container.db?.gdprExportJobs.findById(jobId)) ?? null;
}


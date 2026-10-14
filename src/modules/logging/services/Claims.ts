import { randomInt } from "node:crypto";
import { CacheKeys, CacheTTL } from "#src/lib/cache/Keys.js";
import { cacheStore } from "#src/lib/cache/CacheStore.js";

const LogClaimCodeLength = 6;
export const LogClaimCodeTtlMs = CacheTTL.logClaimCode * 1000;

const CodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export interface LogClaim {
  channelId: string;
  authorId: string;
  messageId: string;
  claimedAt: string;
  replyChannelId?: string;
  replyMessageId?: string;
}

const activeClaims = new Map<string, Map<string, LogClaim>>();
const activeCodes = new Map<string, string>();

function randomLogClaimCode(): string {
  let code = "";
  for (let i = 0; i < LogClaimCodeLength; i++) {
    code += CodeAlphabet[randomInt(CodeAlphabet.length)];
  }
  return code;
}

export function normalizeLogClaimCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  if (code.length !== LogClaimCodeLength) return null;
  for (const char of code) {
    if (!CodeAlphabet.includes(char)) return null;
  }
  return code;
}

export async function issueLogClaimCode(
  guildId: string,
  issuerId: string,
): Promise<string> {
  const code = randomLogClaimCode();
  activeCodes.set(`${guildId}:${code}`, issuerId);
  setTimeout(() => activeCodes.delete(`${guildId}:${code}`), LogClaimCodeTtlMs);
  return code;
}

export async function consumeLogClaimCode(
  guildId: string,
  code: string,
): Promise<string | null> {
  const key = `${guildId}:${code}`;
  const issuerId = activeCodes.get(key) ?? null;
  activeCodes.delete(key);
  return issuerId;
}

export async function peekLogClaimCode(
  guildId: string,
  code: string,
): Promise<string | null> {
  const key = `${guildId}:${code}`;
  return activeCodes.get(key) ?? null;
}

export const registerLogClaim = recordLogClaim;

export async function recordLogClaim(
  guildId: string,
  claim: LogClaim,
): Promise<void> {
  let map = activeClaims.get(guildId);
  if (!map) {
    map = new Map();
    activeClaims.set(guildId, map);
  }
  map.set(claim.channelId, claim);
  cacheStore.set(CacheKeys.logClaim(guildId, claim.channelId), claim, CacheTTL.logClaim * 1000);
}

export async function listLogClaims(guildId: string): Promise<LogClaim[]> {
  const map = activeClaims.get(guildId);
  if (!map) return [];
  const claims = [...map.values()];
  claims.sort((a, b) => a.claimedAt.localeCompare(b.claimedAt));
  return claims;
}

export async function dismissLogClaim(
  guildId: string,
  channelId: string,
): Promise<LogClaim | null> {
  const map = activeClaims.get(guildId);
  if (!map) return null;
  const claim = map.get(channelId) ?? null;
  map.delete(channelId);
  cacheStore.delete(CacheKeys.logClaim(guildId, channelId));
  return claim;
}

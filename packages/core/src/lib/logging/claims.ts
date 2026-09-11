import { randomInt } from "node:crypto";
import { container } from "@sapphire/framework";
import { RedisKeys, RedisTTL } from "#lib/database/redis.js";
import { mgetSafe } from "#lib/database/cluster-safe.js";

export const LogClaimCodeLength = 6;
export const LogClaimCodeTtlMs = RedisTTL.logClaimCode * 1000;

const CodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export interface LogClaim {
  channelId: string;
  authorId: string;
  messageId: string;
  claimedAt: string;
  /** Where the "claimed" reply itself lives — the thread, when the code was
   * posted in one, since `channelId` is the thread's parent (the actual log
   * destination). Falls back to `channelId` for claims from before this
   * field existed. */
  replyChannelId?: string;
  replyMessageId?: string;
}

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
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomLogClaimCode();
    const set = await container.redis.set(
      RedisKeys.logClaimCode(guildId, code),
      issuerId,
      "PX",
      LogClaimCodeTtlMs,
      "NX",
    );
    if (set === "OK") return code;
  }
  throw new Error("Could not issue a claim code, try again.");
}

export async function peekLogClaimCode(
  guildId: string,
  code: string,
): Promise<string | null> {
  return container.redis.get(RedisKeys.logClaimCode(guildId, code));
}

export async function consumeLogClaimCode(
  guildId: string,
  code: string,
): Promise<string | null> {
  return container.redis.getdel(RedisKeys.logClaimCode(guildId, code));
}

export async function registerLogClaim(
  guildId: string,
  claim: LogClaim,
): Promise<void> {
  await container.redis.set(
    RedisKeys.logClaim(guildId, claim.channelId),
    JSON.stringify(claim),
    "EX",
    RedisTTL.logClaim,
  );
  await container.redis.sadd(RedisKeys.logClaimIndex(guildId), claim.channelId);
  await container.redis.expire(RedisKeys.logClaimIndex(guildId), RedisTTL.logClaim);
}

export async function listLogClaims(guildId: string): Promise<LogClaim[]> {
  const channelIds = await container.redis.smembers(
    RedisKeys.logClaimIndex(guildId),
  );
  if (channelIds.length === 0) return [];
  const raws = await mgetSafe(
    container.redis,
    channelIds.map((channelId) => RedisKeys.logClaim(guildId, channelId)),
  );
  const claims: LogClaim[] = [];
  for (const raw of raws) {
    const claim = parseLogClaim(raw);
    if (claim) claims.push(claim);
  }
  claims.sort((a, b) => a.claimedAt.localeCompare(b.claimedAt));
  return claims;
}

export async function dismissLogClaim(
  guildId: string,
  channelId: string,
): Promise<LogClaim | null> {
  const key = RedisKeys.logClaim(guildId, channelId);
  const claim = parseLogClaim(await container.redis.get(key));
  await Promise.all([
    container.invalidation.invalidate(key),
    container.redis.srem(RedisKeys.logClaimIndex(guildId), channelId),
  ]);
  return claim;
}

function parseLogClaim(raw: string | null): LogClaim | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LogClaim>;
    if (
      typeof parsed.channelId !== "string" ||
      typeof parsed.authorId !== "string" ||
      typeof parsed.messageId !== "string" ||
      typeof parsed.claimedAt !== "string"
    ) {
      return null;
    }
    return {
      channelId: parsed.channelId,
      authorId: parsed.authorId,
      messageId: parsed.messageId,
      claimedAt: parsed.claimedAt,
      ...(typeof parsed.replyChannelId === "string"
        ? { replyChannelId: parsed.replyChannelId }
        : {}),
      ...(typeof parsed.replyMessageId === "string"
        ? { replyMessageId: parsed.replyMessageId }
        : {}),
    };
  } catch {
    return null;
  }
}

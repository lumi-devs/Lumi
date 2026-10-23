import { randomInt } from "node:crypto";
import type { Guild, GuildMember, User } from "discord.js";
import type { LumiServices } from "@lumi/module-kit";
import { withLock } from "@lumi/redis";
import type { SecurityConfig } from "../config.ts";
import { getSecurityConfig } from "./config.ts";
import {
  EmojiPool,
  type CaptchaState,
} from "../ui.ts";

const SequenceLength = 4;
const MaxAttempts = 3;
const LockTtlMs = 5_000;

export type CaptchaOutcome = "progress" | "solved" | "wrong" | "failed";

function challengeKey(services: LumiServices, guildId: string, userId: string): string {
  return services.keys.cooldown("verify", `${guildId}:${userId}`);
}

function pendingKey(services: LumiServices, guildId: string): string {
  return services.keys.cooldown("verify-pending", guildId);
}

function lockKey(services: LumiServices, guildId: string, userId: string): string {
  return `${challengeKey(services, guildId, userId)}:lock`;
}

function shuffle<T>(input: readonly T[]): T[] {
  const values = [...input];
  for (let index = values.length - 1; index > 0; index--) {
    const swap = randomInt(index + 1);
    [values[index], values[swap]] = [values[swap]!, values[index]!];
  }
  return values;
}

function buildChallenge(): { sequence: number[]; buttons: number[] } {
  const pool = shuffle(EmojiPool.map((_, index) => index));
  const sequence = pool.slice(0, SequenceLength);
  const distractors = pool.slice(SequenceLength, SequenceLength * 2);
  return { sequence, buttons: shuffle([...sequence, ...distractors]) };
}

function parseState(raw: string | null): CaptchaState | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const state = value as Partial<CaptchaState>;
    if (
      !Array.isArray(state.sequence) ||
      !Array.isArray(state.buttons) ||
      typeof state.progress !== "number" ||
      typeof state.attempts !== "number" ||
      typeof state.expiresAt !== "number"
    ) {
      return null;
    }
    return state as CaptchaState;
  } catch {
    return null;
  }
}

export function isSuspiciousAccount(user: User): boolean {
  const ageMs = Date.now() - user.createdTimestamp;
  return ageMs < 24 * 60 * 60 * 1_000 || user.avatar === null;
}

export async function startChallenge(
  services: LumiServices,
  guildId: string,
  userId: string,
  config: SecurityConfig,
): Promise<CaptchaState> {
  const { sequence, buttons } = buildChallenge();
  const expiresAt = Date.now() + config.verification_timeout_minutes * 60_000;
  const state: CaptchaState = {
    sequence,
    buttons,
    progress: 0,
    attempts: MaxAttempts,
    expiresAt,
  };

  await services.redis.set(
    challengeKey(services, guildId, userId),
    JSON.stringify(state),
    "EXAT",
    Math.max(1, Math.floor(expiresAt / 1_000)),
  );
  return state;
}

export async function getChallenge(
  services: LumiServices,
  guildId: string,
  userId: string,
): Promise<CaptchaState | null> {
  const raw = await services.redis.get(challengeKey(services, guildId, userId));
  if (raw === null) return null;
  const state = parseState(raw);
  if (state && state.expiresAt <= Date.now()) {
    await clearChallenge(services, guildId, userId);
    return null;
  }
  return state;
}

export async function saveChallenge(
  services: LumiServices,
  guildId: string,
  userId: string,
  state: CaptchaState,
): Promise<void> {
  await services.redis.set(
    challengeKey(services, guildId, userId),
    JSON.stringify(state),
    "EXAT",
    Math.max(1, Math.floor(state.expiresAt / 1_000)),
  );
}

export async function clearChallenge(
  services: LumiServices,
  guildId: string,
  userId: string,
): Promise<void> {
  await services.redis.del(challengeKey(services, guildId, userId)).catch(() => undefined);
}

export async function advanceChallenge(
  services: LumiServices,
  guildId: string,
  userId: string,
  clickedIndex: number,
): Promise<{ state: CaptchaState; outcome: CaptchaOutcome } | null> {
  const locked = await withLock(
    services.redis,
    lockKey(services, guildId, userId),
    LockTtlMs,
    async () => {
      const state = await getChallenge(services, guildId, userId);
      if (!state) return null;

      if (state.sequence[state.progress] === clickedIndex) {
        state.progress++;
        const outcome: CaptchaOutcome =
          state.progress >= state.sequence.length ? "solved" : "progress";
        if (outcome === "solved") {
          await clearChallenge(services, guildId, userId);
        } else {
          await saveChallenge(services, guildId, userId, state);
        }
        return { state, outcome };
      }

      state.progress = 0;
      state.attempts--;
      const outcome: CaptchaOutcome = state.attempts <= 0 ? "failed" : "wrong";
      if (outcome === "failed") {
        await clearChallenge(services, guildId, userId);
      } else {
        await saveChallenge(services, guildId, userId, state);
      }
      return { state, outcome };
    },
  );

  return locked.acquired ? locked.value : null;
}

export async function assignPending(
  services: LumiServices,
  member: GuildMember,
  config: SecurityConfig,
): Promise<void> {
  const guildId = member.guild.id;
  if (config.verification_pending_role_id) {
    await member.roles
      .add(config.verification_pending_role_id, "Awaiting verification")
      .catch(() => null);
  }

  const expiresAt = Date.now() + config.verification_timeout_minutes * 60_000;
  const key = pendingKey(services, guildId);
  await services.redis
    .multi()
    .zadd(key, expiresAt, member.id)
    .expire(key, 7 * 24 * 60 * 60)
    .exec();
}

export async function grantVerified(
  services: LumiServices,
  guild: Guild,
  userId: string,
): Promise<boolean> {
  const config = await getSecurityConfig(services, guild.id).catch(() => null);
  const verifiedRoleId = config?.verified_role_id ?? null;
  if (!config || !verifiedRoleId) return false;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return false;

  try {
    await member.roles.add(verifiedRoleId, "Verification passed");
    if (
      config.verification_pending_role_id &&
      member.roles.cache.has(config.verification_pending_role_id)
    ) {
      await member.roles
        .remove(config.verification_pending_role_id, "Verification passed")
        .catch(() => undefined);
    }
  } catch (error) {
    services.logger.warn(
      { error, guildId: guild.id, userId },
      "failed to grant verified role",
    );
    return false;
  }

  await services.redis.zrem(pendingKey(services, guild.id), userId).catch(() => undefined);
  return true;
}

export async function sweepExpiredPending(
  services: LumiServices,
  guild: Guild,
  config: SecurityConfig,
): Promise<void> {
  if (!config.verification_enabled) return;
  const key = pendingKey(services, guild.id);
  const expired = await services.redis.zrangebyscore(key, 0, Date.now()).catch(() => []);
  for (const userId of expired) {
    const member = await guild.members.fetch(userId).catch(() => null);
    const verified =
      member && config.verified_role_id
        ? member.roles.cache.has(config.verified_role_id)
        : false;

    if (member && !verified && config.verification_kick_on_timeout) {
      await member.kick("Verification timed out").catch(() => undefined);
    }
    await services.redis.zrem(key, userId).catch(() => undefined);
    await clearChallenge(services, guild.id, userId);
  }
}

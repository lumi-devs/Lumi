import type { ModuleServices } from "@lumi/module-kit";
import {
  type CardReply,
  cardCreateOptions,
  makeCard,
  makeWarningCard,
} from "@lumi/ui";
import type { Guild, GuildMember } from "discord.js";
import type { Redis } from "ioredis";
import type { z } from "zod";
import { getSecurityConfig, type SecurityConfig } from "./config.js";

export type SecurityResponse = "log" | "quarantine" | "ban";
export type JoinAction = "log" | "kick" | "timeout" | "quarantine";

const KeyPrefix = "lumi:security";

export function securityKey(...parts: Array<string | number>): string {
  return [KeyPrefix, ...parts].join(":");
}

export function redisOf(services: ModuleServices): Redis | null {
  return services.redis ?? null;
}

export async function readModuleConfig<T>(
  services: ModuleServices,
  guildId: string,
  key: string,
  schema: z.ZodType<T>,
  label: string,
): Promise<T> {
  const stored = await services.config.get(guildId, key);
  const parsed = schema.safeParse(stored ?? {});
  if (parsed.success) return parsed.data;

  services.observability?.logger?.warn?.(
    `[${label}] invalid configuration, using defaults`,
    { guildId, issues: parsed.error.issues },
  );
  return schema.parse({});
}

export async function incrementWindow(
  redis: Redis | null,
  key: string,
  windowSeconds: number,
  amount = 1,
): Promise<number> {
  if (!redis) return 0;
  const pipeline = redis.multi();
  pipeline.incrby(key, amount);
  pipeline.expire(key, windowSeconds);
  const results = await pipeline.exec();
  const value = results?.[0]?.[1];
  return typeof value === "number" ? value : Number(value ?? 0);
}

export async function getStoredJson<T>(
  redis: Redis | null,
  key: string,
): Promise<T | null> {
  if (!redis) return null;
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setStoredJson(
  redis: Redis | null,
  key: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<void> {
  if (!redis) return;
  const payload = JSON.stringify(value);
  if (ttlSeconds === undefined) {
    await redis.set(key, payload);
    return;
  }
  await redis.set(key, payload, "EX", ttlSeconds);
}

export async function deleteStored(
  redis: Redis | null,
  key: string,
): Promise<void> {
  if (!redis) return;
  await redis.del(key);
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function roleIds(member: GuildMember | null | undefined): string[] {
  if (!member) return [];
  return Array.from(member.roles.cache.keys());
}

export function isTrusted(
  member: GuildMember | null | undefined,
  guild: Guild,
  config: SecurityConfig,
): boolean {
  if (!member) return false;
  if (member.id === guild.ownerId) return true;
  return config.trustedRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

export function isStaff(
  member: GuildMember | null | undefined,
  guild: Guild,
  config: SecurityConfig,
): boolean {
  if (!member) return false;
  if (member.id === guild.ownerId) return true;
  if (isTrusted(member, guild, config)) return true;
  return member.permissions.has("ManageGuild");
}

export async function hasPermit(
  services: ModuleServices,
  guild: Guild,
  member: GuildMember,
  node: string,
  channelId?: string,
): Promise<boolean> {
  try {
    const result = await services.permits.explainPermit(
      {
        guildId: guild.id,
        userId: member.id,
        roleIds: roleIds(member),
        ...(channelId ? { channelId } : {}),
        guildOwnerId: guild.ownerId,
        permitNode: node,
      },
      services.client,
    );
    return Boolean(result?.allowed);
  } catch {
    return false;
  }
}

export async function sendSecurityLog(
  services: ModuleServices,
  guildId: string,
  card: CardReply,
): Promise<void> {
  const config = await getSecurityConfig(services, guildId);
  if (!config.logChannelId) return;
  const channel = await services.client.channels
    .fetch(config.logChannelId)
    .catch(() => null);
  if (!channel?.isTextBased()) return;
  if (!("send" in channel)) return;
  await channel.send(cardCreateOptions(card)).catch(() => undefined);
}

export async function fetchMember(
  guild: Guild,
  userId: string,
): Promise<GuildMember | null> {
  return guild.members.fetch(userId).catch(() => null);
}

export async function applyResponse(
  services: ModuleServices,
  guild: Guild,
  config: SecurityConfig,
  targetId: string,
  response: SecurityResponse,
  reason: string,
): Promise<string> {
  if (response === "log") return "logged";

  const member = await fetchMember(guild, targetId);
  if (response === "ban") {
    const banned = await guild.bans
      .create(targetId, { reason })
      .then(() => true)
      .catch((error: unknown) => {
        services.observability?.logger?.warn?.("security ban failed", {
          guildId: guild.id,
          targetId,
          error: describeError(error),
        });
        return false;
      });
    return banned ? "banned" : "failed";
  }

  if (!config.quarantineRoleId) return "failed";
  if (!member) return "failed";
  const quarantined = await member.roles
    .set([config.quarantineRoleId], reason)
    .then(() => true)
    .catch((error: unknown) => {
      services.observability?.logger?.warn?.("security quarantine failed", {
        guildId: guild.id,
        targetId,
        error: describeError(error),
      });
      return false;
    });
  return quarantined ? "quarantined" : "failed";
}

export async function applyJoinAction(
  config: SecurityConfig,
  member: GuildMember,
  action: JoinAction,
  reason: string,
): Promise<string> {
  switch (action) {
    case "log":
      return "logged";
    case "kick": {
      const kicked = await member
        .kick(reason)
        .then(() => true)
        .catch(() => false);
      return kicked ? "kicked" : "failed";
    }
    case "timeout": {
      const timed = await member
        .timeout(10 * 60_000, reason)
        .then(() => true)
        .catch(() => false);
      return timed ? "timed out" : "failed";
    }
    case "quarantine": {
      if (!config.quarantineRoleId) return "failed";
      const quarantined = await member.roles
        .set([config.quarantineRoleId], reason)
        .then(() => true)
        .catch(() => false);
      return quarantined ? "quarantined" : "failed";
    }
  }
}

export function securityCard(
  title: string,
  lines: string[],
  opts?: { footer?: string },
): CardReply {
  return makeCard(undefined, title, lines, opts);
}

export function warningCard(title: string, lines: string[]): CardReply {
  return makeWarningCard(title, lines);
}

import { container } from "#src/lib/Services.js";
import { Colors, PermissionFlagsBits, type Guild } from "discord.js";
import { isNullish, type Awaitable } from "#src/shared/Index.ts";
import { CacheKeys } from "#src/lib/cache/Keys.js";
import { QuarantineAction } from "#src/lib/api/moderation/Quarantine.js";
import { isImmuneToAutomatedAction } from "#src/lib/api/moderation/Immunity.js";
import { logToChannel } from "#src/lib/api/moderation/ModLog.js";
import { toStringArray } from "#src/lib/module-system/ConfigSchema.js";
import { getConfigNumber } from "#src/modules/security/services/ConfigHelpers.js";

export type NukeKind =
  | "ban"
  | "kick"
  | "channel_delete"
  | "role_delete"
  | "webhook_create"
  | "vanity_change"
  | "dangerous_permission_grant"
  | "quarantine_bypass";

type NukeResponse = "log" | "quarantine" | "ban";

interface AntiNukeConfig {
  enabled: boolean;
  windowSeconds: number;
  limits: Record<NukeKind, number>;
  responses: Record<NukeKind, NukeResponse>;
  trustedRoleIds: string[];
}

const KindLimitKeys: Record<NukeKind, string> = {
  ban: "max_bans",
  kick: "max_kicks",
  channel_delete: "max_channel_deletes",
  role_delete: "max_role_deletes",
  webhook_create: "max_webhook_creates",
  vanity_change: "max_vanity_changes",
  dangerous_permission_grant: "max_permission_grants",
  quarantine_bypass: "max_quarantine_bypass",
};

const KindResponseKeys: Partial<Record<NukeKind, string>> = {
  ban: "response_bans",
  kick: "response_kicks",
  channel_delete: "response_channel_deletes",
  role_delete: "response_role_deletes",
  webhook_create: "response_webhook_creates",
};

const DefaultNukeResponse: NukeResponse = "quarantine";

function isNukeResponse(value: unknown): value is NukeResponse {
  return value === "log" || value === "quarantine" || value === "ban";
}

const TrippedCooldownSeconds = 300;

export const DangerousPermissions = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
] as const;

export async function loadAntiNukeConfig(guildId: string): Promise<AntiNukeConfig> {
  const raw = await container.db.config.getAllModuleConfig(guildId, "security");

  const trustedRoleIds = toStringArray(raw["trusted_role_ids"]);

  return {
    enabled: raw["antinuke_enabled"] === true,
    windowSeconds: getConfigNumber(raw, "window_seconds", 60),
    limits: {
      ban: getConfigNumber(raw, KindLimitKeys.ban, 5),
      kick: getConfigNumber(raw, KindLimitKeys.kick, 5),
      channel_delete: getConfigNumber(raw, KindLimitKeys.channel_delete, 3),
      role_delete: getConfigNumber(raw, KindLimitKeys.role_delete, 3),
      webhook_create: getConfigNumber(raw, KindLimitKeys.webhook_create, 3),
      vanity_change: getConfigNumber(raw, KindLimitKeys.vanity_change, 1),
      dangerous_permission_grant: getConfigNumber(
        raw,
        KindLimitKeys.dangerous_permission_grant,
        1,
      ),
      quarantine_bypass: getConfigNumber(raw, KindLimitKeys.quarantine_bypass, 1),
    },
    responses: loadResponses(raw),
    trustedRoleIds,
  };
}

function loadResponses(raw: Record<string, unknown>): Record<NukeKind, NukeResponse> {
  const kinds: NukeKind[] = [
    "ban",
    "kick",
    "channel_delete",
    "role_delete",
    "webhook_create",
    "vanity_change",
    "dangerous_permission_grant",
    "quarantine_bypass",
  ];
  return Object.fromEntries(
    kinds.map((kind) => {
      const key = KindResponseKeys[kind];
      const value = key ? raw[key] : undefined;
      return [kind, isNukeResponse(value) ? value : DefaultNukeResponse];
    }),
  ) as Record<NukeKind, NukeResponse>;
}

const securityWindows = new Map<string, { count: number; expiresAt: number }>();
const securityTripped = new Map<string, number>();

export async function recordAction(
  guild: Guild,
  executorId: string,
  kind: NukeKind,
  config: AntiNukeConfig,
): Promise<number | null> {
  const key = `${guild.id}:${executorId}:${kind}`;
  const now = Date.now();
  const entry = securityWindows.get(key);
  let count = 1;
  if (entry && entry.expiresAt > now) {
    count = entry.count + 1;
    entry.count = count;
  } else {
    securityWindows.set(key, { count: 1, expiresAt: now + config.windowSeconds * 1000 });
  }

  if (count <= config.limits[kind]) return null;

  const tripUntil = securityTripped.get(key);
  if (!tripUntil || tripUntil <= now) {
    securityTripped.set(key, now + TrippedCooldownSeconds * 1000);
    return count;
  }
  return null;
}

export async function isExempt(
  guild: Guild,
  executorId: string,
  config: AntiNukeConfig,
): Promise<boolean> {
  if (executorId === guild.ownerId) return true;
  if (executorId === container.client.user?.id) return true;

  if (config.trustedRoleIds.length === 0) return false;
  const member = await guild.members.fetch(executorId).catch(() => null);
  if (isNullish(member)) return false;
  return config.trustedRoleIds.some((id) => member.roles.cache.has(id));
}

export async function respond(
  guild: Guild,
  executorId: string,
  kind: NukeKind,
  count: number,
  config: AntiNukeConfig,
): Promise<void> {
  const reason = `Anti-nuke: ${count} ${kind.replaceAll("_", " ")} actions in ${config.windowSeconds}s`;
  const botUser = container.client.user;
  if (isNullish(botUser)) return;

  const member = await guild.members.fetch(executorId).catch(() => null);
  const immune =
    member !== null &&
    (await isImmuneToAutomatedAction(container, guild.id, member));

  const response = config.responses[kind];
  let outcome = "logged";
  if (response === "quarantine") {
    if (member && !immune) {
      try {
        await QuarantineAction.apply({
          guild,
          targetMember: member,
          moderator: botUser,
          reason,
        });
        outcome = "quarantined";
      } catch (err: unknown) {
        container.logger.warn(
          `[security] Quarantine failed for ${executorId} in ${guild.id}: ${String(err)}`,
        );
      }
    }
  } else if (response === "ban") {
    if (!immune) {
      try {
        await guild.members.ban(executorId, { reason });
        const c = await container.db.moderation.createModerationCase({
          guildId: guild.id,
          userId: executorId,
          moderatorId: botUser.id,
          action: "ban",
          reason,
        });
        await logToChannel(
          container,
          guild.id,
          "🔨 Banned",
          Colors.DarkRed,
          executorId,
          botUser,
          reason,
          c.caseNumber,
          "security",
        );
        outcome = "banned";
      } catch (err: unknown) {
        container.logger.warn(
          `[security] Ban failed for ${executorId} in ${guild.id}: ${String(err)}`,
        );
        securityTripped.delete(`${guild.id}:${executorId}:${kind}`);
      }
    }
  }

  if (outcome === "logged") {
    const c = await container.db.moderation.createModerationCase({
      guildId: guild.id,
      userId: executorId,
      moderatorId: botUser.id,
      action: "antinuke_alert",
      reason,
    });
    await logToChannel(
      container,
      guild.id,
      "🚨 Anti-Nuke Alert",
      Colors.Red,
      executorId,
      botUser,
      reason,
      c.caseNumber,
      "security",
    );
  }
}

export async function evaluateNukeEvent(
  guild: Guild,
  kind: NukeKind,
  resolveExecutorId: () => Awaitable<string | null | undefined>,
): Promise<void> {
  const config = await loadAntiNukeConfig(guild.id);
  if (!config.enabled) return;

  const executorId = await resolveExecutorId();
  if (isNullish(executorId)) return;
  if (await isExempt(guild, executorId, config)) return;

  const count = await recordAction(guild, executorId, kind, config);
  if (count === null) return;

  container.logger.warn(
    `[security] Anti-nuke tripped in ${guild.id}: ${executorId} triggered ${kind} ${count} time(s)`,
  );
  await respond(guild, executorId, kind, count, config);
}

export async function isQuarantined(guildId: string, userId: string): Promise<boolean> {
  const { cacheStore } = await import("#src/lib/cache/CacheStore.js");
  return cacheStore.has(CacheKeys.quarantineState(guildId, userId));
}

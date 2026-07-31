import { ApplyOptions } from "@sapphire/decorators";
import type { Piece } from "@sapphire/framework";
import { Colors, type Guild } from "discord.js";
import { isNullish } from "@sapphire/utilities";
import { Service } from "#lib/module-system/Service.js";
import { RedisKeys } from "#database/redis.js";
import { QuarantineAction } from "#lib/moderation/QuarantineAction.js";
import { logToChannel } from "#lib/moderation/log.js";

export type NukeKind =
  | "ban"
  | "kick"
  | "channel_delete"
  | "role_delete"
  | "webhook_create";

export interface AntiNukeConfig {
  enabled: boolean;
  windowSeconds: number;
  limits: Record<NukeKind, number>;
  response: "log" | "quarantine" | "ban";
  trustedRoleIds: string[];
}

const KIND_LIMIT_KEYS: Record<NukeKind, string> = {
  ban: "max_bans",
  kick: "max_kicks",
  channel_delete: "max_channel_deletes",
  role_delete: "max_role_deletes",
  webhook_create: "max_webhook_creates",
};

const TRIPPED_COOLDOWN_SECONDS = 300;

@ApplyOptions<Piece.Options>({ name: "security" })
export class SecurityService extends Service {
  public async loadAntiNukeConfig(guildId: string): Promise<AntiNukeConfig> {
    const raw = await this.db.config.getAllModuleConfig(guildId, "security");
    const num = (key: string, fallback: number): number =>
      typeof raw[key] === "number" ? (raw[key] as number) : fallback;

    const trustedRaw = raw["trusted_role_ids"];
    const trustedRoleIds =
      typeof trustedRaw === "string"
        ? trustedRaw
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id.length > 0)
        : [];

    return {
      enabled: raw["antinuke_enabled"] === true,
      windowSeconds: num("window_seconds", 60),
      limits: {
        ban: num(KIND_LIMIT_KEYS.ban, 5),
        kick: num(KIND_LIMIT_KEYS.kick, 5),
        channel_delete: num(KIND_LIMIT_KEYS.channel_delete, 3),
        role_delete: num(KIND_LIMIT_KEYS.role_delete, 3),
        webhook_create: num(KIND_LIMIT_KEYS.webhook_create, 3),
      },
      response:
        raw["response"] === "log" || raw["response"] === "ban"
          ? raw["response"]
          : "quarantine",
      trustedRoleIds,
    };
  }

  /**
   * Records one action of `kind` for the executor and returns the running
   * count when it exceeds the configured limit; null while under it or when
   * this executor already tripped recently (response is in flight).
   */
  public async recordAction(
    guild: Guild,
    executorId: string,
    kind: NukeKind,
    config: AntiNukeConfig,
  ): Promise<number | null> {
    const key = RedisKeys.securityWindow(guild.id, executorId, kind);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, config.windowSeconds);
    }
    if (count <= config.limits[kind]) return null;

    const tripped = await this.redis.set(
      RedisKeys.securityTripped(guild.id, executorId),
      String(Date.now()),
      "EX",
      TRIPPED_COOLDOWN_SECONDS,
      "NX",
    );
    return tripped === "OK" ? count : null;
  }

  public async isExempt(
    guild: Guild,
    executorId: string,
    config: AntiNukeConfig,
  ): Promise<boolean> {
    if (executorId === guild.ownerId) return true;
    if (executorId === this.container.client.user?.id) return true;

    if (config.trustedRoleIds.length === 0) return false;
    const member = await guild.members.fetch(executorId).catch(() => null);
    if (isNullish(member)) return false;
    return config.trustedRoleIds.some((id) => member.roles.cache.has(id));
  }

  public async respond(
    guild: Guild,
    executorId: string,
    kind: NukeKind,
    count: number,
    config: AntiNukeConfig,
  ): Promise<void> {
    const reason = `Anti-nuke: ${count} ${kind.replace("_", " ")} actions in ${config.windowSeconds}s`;
    const botUser = this.container.client.user;
    if (isNullish(botUser)) return;

    let outcome = "logged";
    if (config.response === "quarantine") {
      const member = await guild.members.fetch(executorId).catch(() => null);
      if (member) {
        try {
          await QuarantineAction.apply({
            guild,
            targetMember: member,
            moderator: botUser,
            reason,
          });
          outcome = "quarantined";
        } catch (err: unknown) {
          this.logger.warn(
            `[security] Quarantine failed for ${executorId} in ${guild.id}: ${String(err)}`,
          );
        }
      }
    } else if (config.response === "ban") {
      try {
        await guild.members.ban(executorId, { reason });
        const c = await this.db.moderation.createModerationCase({
          guildId: guild.id,
          userId: executorId,
          moderatorId: botUser.id,
          action: "ban",
          reason,
        });
        await logToChannel(
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
        this.logger.warn(
          `[security] Ban failed for ${executorId} in ${guild.id}: ${String(err)}`,
        );
      }
    }

    if (outcome === "logged") {
      const c = await this.db.moderation.createModerationCase({
        guildId: guild.id,
        userId: executorId,
        moderatorId: botUser.id,
        action: "antinuke_alert",
        reason,
      });
      await logToChannel(
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
}

declare module "#lib/module-system/Service.js" {
  interface Services {
    security: SecurityService;
  }
}

import { ApplyOptions } from "@sapphire/decorators";
import type { Piece } from "@sapphire/framework";
import {
  ChannelType,
  Colors,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
} from "discord.js";
import { isNullish, tryParseJSON } from "@sapphire/utilities";
import { Service } from "#lib/module-system/Service.js";
import { RedisKeys } from "#database/redis.js";
import { QuarantineAction } from "#lib/moderation/QuarantineAction.js";
import { logToChannel } from "#lib/moderation/log.js";
import type { LockedChannelSnapshot } from "#lib/prisma/repositories/SecurityRepository.js";
import {
  buildChallenge,
  MAX_ATTEMPTS,
  type CaptchaState,
} from "../lib/captcha.js";

export interface PanicResult {
  invitesPaused: boolean;
  lockedCount: number;
  skippedCount: number;
}

export interface PanicRevertResult {
  restoredCount: number;
}

const PANIC_CHANNEL_CAP = 40;
const PANIC_EDIT_DELAY_MS = 300;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

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

export type GateAction = "kick" | "timeout" | "quarantine";

export interface JoinGateConfig {
  enabled: boolean;
  minAccountAgeHours: number;
  raidJoinCount: number;
  raidWindowSeconds: number;
  raidAction: GateAction;
}

export interface VerificationConfig {
  enabled: boolean;
  verifiedRoleId: string | null;
  pendingRoleId: string | null;
  timeoutMinutes: number;
  kickOnTimeout: boolean;
}

const KIND_LIMIT_KEYS: Record<NukeKind, string> = {
  ban: "max_bans",
  kick: "max_kicks",
  channel_delete: "max_channel_deletes",
  role_delete: "max_role_deletes",
  webhook_create: "max_webhook_creates",
};

const TRIPPED_COOLDOWN_SECONDS = 300;
const RAID_MODE_SECONDS = 600;
const GATE_TIMEOUT_MS = 60 * 60 * 1000;

@ApplyOptions<Piece.Options>({ name: "security" })
export class SecurityService extends Service {
  public async loadAntiNukeConfig(guildId: string): Promise<AntiNukeConfig> {
    const raw = await this.db.config.getAllModuleConfig(guildId, "security");
    const num = (key: string, fallback: number): number =>
      typeof raw[key] === "number" ? (raw[key]) : fallback;

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

  public async loadJoinGateConfig(guildId: string): Promise<JoinGateConfig> {
    const raw = await this.db.config.getAllModuleConfig(guildId, "security");
    const num = (key: string, fallback: number): number =>
      typeof raw[key] === "number" ? (raw[key]) : fallback;
    const action = raw["raid_action"];

    return {
      enabled: raw["joingate_enabled"] === true,
      minAccountAgeHours: num("min_account_age_hours", 0),
      raidJoinCount: num("raid_join_count", 10),
      raidWindowSeconds: num("raid_window_seconds", 30),
      raidAction:
        action === "timeout" || action === "quarantine" ? action : "kick",
    };
  }

  /**
   * Counts a join toward raid detection. Returns true when this join pushes
   * the guild over the threshold and raid mode was newly activated.
   */
  public async recordJoin(
    guildId: string,
    config: JoinGateConfig,
  ): Promise<boolean> {
    const key = RedisKeys.joinBurst(guildId);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, config.raidWindowSeconds);
    }
    if (count < config.raidJoinCount) return false;

    const started = await this.redis.set(
      RedisKeys.raidMode(guildId),
      String(Date.now()),
      "EX",
      RAID_MODE_SECONDS,
      "NX",
    );
    return started === "OK";
  }

  public async isRaidActive(guildId: string): Promise<boolean> {
    return (await this.redis.exists(RedisKeys.raidMode(guildId))) === 1;
  }

  public async endRaidMode(guildId: string): Promise<void> {
    if (this.container.invalidation) {
      await this.container.invalidation.invalidate(RedisKeys.raidMode(guildId));
    } else {
      await this.redis.del(RedisKeys.raidMode(guildId));
    }
  }

  public async loadVerificationConfig(
    guildId: string,
  ): Promise<VerificationConfig> {
    const raw = await this.db.config.getAllModuleConfig(guildId, "security");
    const str = (key: string): string | null => {
      const v = raw[key];
      return typeof v === "string" && v ? v : null;
    };
    const timeout =
      typeof raw["verification_timeout_minutes"] === "number"
        ? raw["verification_timeout_minutes"]
        : 10;
    return {
      enabled: raw["verification_enabled"] === true,
      verifiedRoleId: str("verified_role_id"),
      pendingRoleId: str("verification_pending_role_id"),
      timeoutMinutes: timeout,
      kickOnTimeout: raw["verification_kick_on_timeout"] === true,
    };
  }

  /**
   * Builds a fresh emoji-sequence challenge for a member, persists it (expiring
   * at the configured timeout), and tracks the member in the pending set for
   * the timeout sweep. Returns the state to render.
   */
  public async startChallenge(
    guildId: string,
    userId: string,
    config: VerificationConfig,
  ): Promise<CaptchaState> {
    const { sequence, buttons } = buildChallenge();
    const expiresAt = Date.now() + config.timeoutMinutes * 60 * 1000;
    const state: CaptchaState = {
      sequence,
      buttons,
      progress: 0,
      attempts: MAX_ATTEMPTS,
      expiresAt,
    };
    await this.redis
      .multi()
      .set(
        RedisKeys.verifyChallenge(guildId, userId),
        JSON.stringify(state),
        "EXAT",
        Math.floor(expiresAt / 1000),
      )
      .zadd(RedisKeys.verifyPending(guildId), expiresAt, userId)
      .exec();
    return state;
  }

  public async getChallenge(
    guildId: string,
    userId: string,
  ): Promise<CaptchaState | null> {
    const raw = await this.redis.get(RedisKeys.verifyChallenge(guildId, userId));
    if (isNullish(raw)) return null;
    return tryParseJSON(raw) as CaptchaState | null;
  }

  public async saveChallenge(
    guildId: string,
    userId: string,
    state: CaptchaState,
  ): Promise<void> {
    await this.redis.set(
      RedisKeys.verifyChallenge(guildId, userId),
      JSON.stringify(state),
      "EXAT",
      Math.floor(state.expiresAt / 1000),
    );
  }

  /** Drops all pending state for a member (on success or failure). */
  public async clearChallenge(guildId: string, userId: string): Promise<void> {
    await this.redis
      .multi()
      .del(RedisKeys.verifyChallenge(guildId, userId))
      .zrem(RedisKeys.verifyPending(guildId), userId)
      .exec();
  }

  /** Grants the verified role and strips the pending role once a member passes. */
  public async grantVerified(guild: Guild, userId: string): Promise<boolean> {
    const config = await this.loadVerificationConfig(guild.id);
    if (isNullish(config.verifiedRoleId)) return false;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (isNullish(member)) return false;
    try {
      await member.roles.add(config.verifiedRoleId, "Verification passed");
      if (config.pendingRoleId && member.roles.cache.has(config.pendingRoleId)) {
        await member.roles
          .remove(config.pendingRoleId, "Verification passed")
          .catch(() => null);
      }
    } catch (err: unknown) {
      this.logger.warn(
        `[security] Verify role grant failed for ${userId} in ${guild.id}: ${String(err)}`,
      );
      return false;
    }
    return true;
  }

  /** Assigns the pending role on join and starts the timeout clock. */
  public async assignPending(
    member: GuildMember,
    config: VerificationConfig,
  ): Promise<void> {
    if (config.pendingRoleId) {
      await member.roles
        .add(config.pendingRoleId, "Awaiting verification")
        .catch(() => null);
    }
    const expiresAt = Date.now() + config.timeoutMinutes * 60 * 1000;
    await this.redis.zadd(
      RedisKeys.verifyPending(member.guild.id),
      expiresAt,
      member.id,
    );
  }

  /**
   * Kicks (or just clears) members whose verification window elapsed. Called by
   * the periodic sweep; safe to run on any worker holding the guild.
   */
  public async sweepExpiredPending(guild: Guild): Promise<void> {
    const config = await this.loadVerificationConfig(guild.id);
    if (!config.enabled) return;
    const expired = await this.redis.zrangebyscore(
      RedisKeys.verifyPending(guild.id),
      0,
      Date.now(),
    );
    for (const userId of expired) {
      if (config.kickOnTimeout) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member && !member.roles.cache.has(config.verifiedRoleId ?? "")) {
          await member.kick("Verification timed out").catch(() => null);
        }
      }
      await this.clearChallenge(guild.id, userId);
    }
  }

  public async applyGateAction(
    guild: Guild,
    memberId: string,
    action: GateAction,
    reason: string,
  ): Promise<boolean> {
    const member = await guild.members.fetch(memberId).catch(() => null);
    if (isNullish(member)) return false;
    const botUser = this.container.client.user;
    if (isNullish(botUser)) return false;

    try {
      if (action === "kick") {
        await member.kick(reason);
      } else if (action === "timeout") {
        await member.timeout(GATE_TIMEOUT_MS, reason);
      } else {
        await QuarantineAction.apply({
          guild,
          targetMember: member,
          moderator: botUser,
          reason,
        });
        return true;
      }
      const c = await this.db.moderation.createModerationCase({
        guildId: guild.id,
        userId: memberId,
        moderatorId: botUser.id,
        action: action === "kick" ? "kick" : "mute",
        reason,
      });
      await logToChannel(
        guild.id,
        action === "kick" ? "👢 Gate Kicked" : "🔇 Gate Timed Out",
        Colors.Orange,
        memberId,
        botUser,
        reason,
        c.caseNumber,
        "security",
      );
      return true;
    } catch (err: unknown) {
      this.logger.warn(
        `[security] Gate ${action} failed for ${memberId} in ${guild.id}: ${String(err)}`,
      );
      return false;
    }
  }

  /**
   * Activates panic mode: pauses invites and locks `@everyone` SendMessages
   * across the guild's text channels (or a configured subset), snapshotting
   * prior overwrites so `revertPanic` can restore them exactly.
   */
  public async enterPanic(
    guild: Guild,
    actorId: string,
    channelIds: string[],
  ): Promise<PanicResult> {
    let invitesPaused = false;
    try {
      await guild.disableInvites(true);
      invitesPaused = true;
    } catch (err: unknown) {
      this.logger.warn(
        `[security] Panic: failed to pause invites in ${guild.id}: ${String(err)}`,
      );
    }

    const candidates =
      channelIds.length > 0
        ? channelIds
            .map((id) => guild.channels.cache.get(id))
            .filter((c): c is NonNullable<typeof c> => Boolean(c))
        : [...guild.channels.cache.values()].filter(
            (c) =>
              c.type === ChannelType.GuildText ||
              c.type === ChannelType.GuildAnnouncement,
          );

    const targets = candidates.slice(0, PANIC_CHANNEL_CAP);
    const everyone = guild.roles.everyone;
    const snapshot: LockedChannelSnapshot = {};
    let lockedCount = 0;

    for (const channel of targets) {
      if (!("permissionOverwrites" in channel)) continue;
      try {
        const overwrite = channel.permissionOverwrites.cache.get(everyone.id);
        const prior = overwrite?.allow.has(PermissionFlagsBits.SendMessages)
          ? true
          : overwrite?.deny.has(PermissionFlagsBits.SendMessages)
            ? false
            : null;
        snapshot[channel.id] = prior;
        await channel.permissionOverwrites.edit(
          everyone,
          { SendMessages: false },
          { reason: `Panic mode activated by ${actorId}` },
        );
        lockedCount++;
      } catch (err: unknown) {
        this.logger.warn(
          `[security] Panic: failed to lock channel ${channel.id} in ${guild.id}: ${String(err)}`,
        );
      }
      await sleep(PANIC_EDIT_DELAY_MS);
    }

    await this.db.security.savePanicState({
      guildId: guild.id,
      actorId,
      invitesPaused,
      lockedChannels: snapshot,
    });

    return {
      invitesPaused,
      lockedCount,
      skippedCount: targets.length - lockedCount,
    };
  }

  /** Restores invites and every channel overwrite snapshotted by `enterPanic`. */
  public async revertPanic(guild: Guild): Promise<PanicRevertResult | null> {
    const state = await this.db.security.getPanicState(guild.id);
    if (!state) return null;

    if (state.invitesPaused) {
      await guild.disableInvites(false).catch((err: unknown) => {
        this.logger.warn(
          `[security] Panic: failed to resume invites in ${guild.id}: ${String(err)}`,
        );
      });
    }

    const snapshot = (state.lockedChannels ?? {}) as LockedChannelSnapshot;
    const everyone = guild.roles.everyone;
    let restoredCount = 0;

    for (const [channelId, prior] of Object.entries(snapshot)) {
      const channel = guild.channels.cache.get(channelId);
      if (!channel || !("permissionOverwrites" in channel)) continue;
      try {
        await channel.permissionOverwrites.edit(
          everyone,
          { SendMessages: prior },
          { reason: "Panic mode reverted" },
        );
        restoredCount++;
      } catch (err: unknown) {
        this.logger.warn(
          `[security] Panic: failed to restore channel ${channelId} in ${guild.id}: ${String(err)}`,
        );
      }
      await sleep(PANIC_EDIT_DELAY_MS);
    }

    await this.db.security.clearPanicState(guild.id);
    return { restoredCount };
  }
}

declare module "#lib/module-system/Service.js" {
  interface Services {
    security: SecurityService;
  }
}

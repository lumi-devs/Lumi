import { ApplyOptions } from "@sapphire/decorators";
import type { Piece } from "@sapphire/framework";
import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type GuildTextBasedChannel,
} from "discord.js";
import { isNullish, tryParseJSON } from "@sapphire/utilities";
import { fetchTyped } from "#lib/commands.js";
import { Utility } from "#lib/module-system/Utility.js";
import { RedisKeys } from "#lib/database/redis.js";
import { withSerializedWork } from "#lib/utilities/misc.js";
import type { LockedChannelSnapshot } from "#lib/prisma/repositories/SecurityRepository.js";
import {
  advanceCaptcha,
  buildChallenge,
  MaxAttempts,
  type CaptchaOutcome,
  type CaptchaState,
} from "../services/captcha.js";
import { snapshotGuild } from "../services/backup-types.js";
import { restoreGuildFromBackup } from "../services/restore-guild.js";
import {
  getConfigNumber,
  getConfigString,
} from "../services/config-helpers.js";
import { buildVerifyPanel, type VerifyPanelContent } from "../ui/verify-panel.js";

export interface PanicResult {
  invitesPaused: boolean;
  lockedCount: number;
  skippedCount: number;
}

export interface PanicRevertResult {
  restoredCount: number;
  restoredStructure: { rolesRestored: number; channelsRestored: number } | null;
}

export interface VerifyPanelSetResult {
  channelId: string;
  messageId: string;
  posted: boolean;
  edited: boolean;
  moved: boolean;
  createdChannel: boolean;
  oldMessageDeleted: boolean;
}

const PanicChannelCap = 40;
const PanicEditDelayMs = 300;

export type VerificationMode = "emoji" | "none" | "web";
export type VerificationTarget = "everyone" | "suspicious";

export interface VerificationConfig {
  enabled: boolean;
  mode: VerificationMode;
  target: VerificationTarget;
  verifiedRoleId: string | null;
  pendingRoleId: string | null;
  timeoutMinutes: number;
  kickOnTimeout: boolean;
}

/** Permissions that hand out server control - never allowed on `@everyone`. */
export const DangerousPermissions = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
] as const;

function challengeLockKey(guildId: string, userId: string): string {
  return `security:verify-challenge:${guildId}:${userId}`;
}

function panicLockKey(guildId: string): string {
  return `security:panic:${guildId}`;
}

@ApplyOptions<Piece.Options>({ name: "security" })
export class SecurityUtility extends Utility {
  public async loadVerificationConfig(
    guildId: string,
  ): Promise<VerificationConfig> {
    const raw = await this.db.config.getAllModuleConfig(guildId, "security");
    const timeout = getConfigNumber(raw, "verification_timeout_minutes", 10);
    const mode = raw["verification_mode"];
    const target = raw["verification_target"];
    return {
      enabled: raw["verification_enabled"] === true,
      mode: mode === "none" || mode === "web" ? mode : "emoji",
      target: target === "suspicious" ? "suspicious" : "everyone",
      verifiedRoleId: getConfigString(raw, "verified_role_id"),
      pendingRoleId: getConfigString(raw, "verification_pending_role_id"),
      timeoutMinutes: timeout,
      kickOnTimeout: raw["verification_kick_on_timeout"] === true,
    };
  }

  private async loadVerifyPanelContent(guildId: string): Promise<VerifyPanelContent> {
    const raw = await this.db.config.getAllModuleConfig(guildId, "security");
    return {
      title: getConfigString(raw, "verification_panel_title"),
      welcome: getConfigString(raw, "verification_panel_welcome"),
      footer: getConfigString(raw, "verification_panel_footer"),
    };
  }

  /**
   * Posts the verification panel to `channelId` (or a freshly created
   * channel), editing the currently tracked message in place when the target
   * channel hasn't changed and that message still exists. Falls back to
   * posting fresh whenever the tracked message can't be found or edited
   * (channel access lost, message deleted out from under it), or when the
   * target channel differs from the one currently tracked.
   */
  public async postOrEditVerifyPanel(
    guild: Guild,
    opts: {
      channelId?: string;
      createChannel?: boolean;
      deleteOldMessage?: boolean;
    },
  ): Promise<VerifyPanelSetResult> {
    const config = await this.loadVerificationConfig(guild.id);
    if (!config.enabled || !config.verifiedRoleId) {
      throw new Error(
        "Turn on Verification and pick a Verified Role before posting the panel.",
      );
    }

    const existing = await this.db.security.getVerificationPanel(guild.id);

    let target: GuildTextBasedChannel;
    let createdChannel = false;
    if (opts.createChannel) {
      target = await guild.channels.create({
        name: "verify-here",
        type: ChannelType.GuildText,
        reason: "Dashboard: verification panel channel",
      });
      createdChannel = true;
    } else {
      if (!opts.channelId) throw new Error("channelId is required");
      const channel = await guild.channels.fetch(opts.channelId).catch(() => null);
      if (!channel?.isTextBased()) {
        throw new Error(
          "That channel doesn't exist or isn't a text channel Lumi can post in.",
        );
      }
      target = channel;
    }

    const t = await fetchTyped(guild);
    const content = await this.loadVerifyPanelContent(guild.id);
    const card = buildVerifyPanel(t, content);

    const movedChannel = Boolean(existing) && existing!.channelId !== target.id;

    if (existing && !movedChannel) {
      const message = await target.messages
        .fetch(existing.messageId)
        .catch(() => null);
      if (message) {
        try {
          await message.edit(card);
          return {
            channelId: target.id,
            messageId: message.id,
            posted: false,
            edited: true,
            moved: false,
            createdChannel,
            oldMessageDeleted: false,
          };
        } catch (err: unknown) {
          this.logger.warn(
            `[security] Verify panel edit failed in ${guild.id}, posting fresh instead: ${String(err)}`,
          );
        }
      }
    }

    let oldMessageDeleted = false;
    if (existing && movedChannel && opts.deleteOldMessage) {
      const oldChannel = await guild.channels
        .fetch(existing.channelId)
        .catch(() => null);
      if (oldChannel?.isTextBased()) {
        const oldMessage = await oldChannel.messages
          .fetch(existing.messageId)
          .catch(() => null);
        if (oldMessage) {
          await oldMessage.delete().catch(() => null);
          oldMessageDeleted = true;
        }
      }
    }

    const message = await target.send(card);
    await this.db.security.saveVerificationPanel({
      guildId: guild.id,
      channelId: target.id,
      messageId: message.id,
    });

    return {
      channelId: target.id,
      messageId: message.id,
      posted: true,
      edited: false,
      moved: movedChannel,
      createdChannel,
      oldMessageDeleted,
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
      attempts: MaxAttempts,
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

  public async advanceChallenge(
    guildId: string,
    userId: string,
    clickedIdx: number,
  ): Promise<{ state: CaptchaState; outcome: CaptchaOutcome } | null> {
    return withSerializedWork(challengeLockKey(guildId, userId), async () => {
      const state = await this.getChallenge(guildId, userId);
      if (isNullish(state)) return null;

      const result = advanceCaptcha(state, clickedIdx);
      if (result.outcome === "solved" || result.outcome === "failed") {
        await this.clearChallenge(guildId, userId);
      } else {
        await this.saveChallenge(guildId, userId, result.state);
      }
      return result;
    });
  }

  /** Drops all pending state for a member (on success or failure). */
  public async clearChallenge(guildId: string, userId: string): Promise<void> {
    await this.container.invalidation.invalidate(
      RedisKeys.verifyChallenge(guildId, userId),
    );
    await this.redis.zrem(RedisKeys.verifyPending(guildId), userId);
  }

  /** Grants the verified role and strips the pending role once a member passes. */
  public async grantVerified(guild: Guild, userId: string): Promise<boolean> {
    const config = await this.loadVerificationConfig(guild.id);
    if (isNullish(config.verifiedRoleId)) return false;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (isNullish(member)) return false;
    try {
      const nextRoles = new Set(member.roles.cache.keys());
      nextRoles.add(config.verifiedRoleId);
      if (config.pendingRoleId) nextRoles.delete(config.pendingRoleId);
      await member.roles.set([...nextRoles], "Verification passed");
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
      if (config.kickOnTimeout && config.verifiedRoleId) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member && !member.roles.cache.has(config.verifiedRoleId)) {
          await member.kick("Verification timed out").catch(() => null);
        }
      }
      await this.clearChallenge(guild.id, userId);
    }
  }

  public async loadBackupConfig(
    guildId: string,
  ): Promise<{ intervalHours: number; keepCount: number }> {
    const raw = await this.db.config.getAllModuleConfig(guildId, "security");
    return {
      intervalHours: getConfigNumber(raw, "backup_interval_hours", 3),
      keepCount: getConfigNumber(raw, "backup_keep_count", 10),
    };
  }

  /** Snapshots the guild's role/channel structure and prunes old backups past `keepCount`. */
  public async createBackup(guild: Guild, keepCount: number): Promise<number> {
    const data = snapshotGuild(guild);
    const backup = await this.db.security.createBackup(guild.id, data);
    await this.db.security.pruneBackups(guild.id, keepCount);
    return backup.id;
  }

  /** Marks the guild as having lost structure during the current panic window, for auto-restore on revert. */
  public async flagRestorePending(guildId: string): Promise<void> {
    await this.redis.set(
      RedisKeys.securityRestorePending(guildId),
      "1",
      "EX",
      24 * 60 * 60,
    );
  }

  public async isRestorePending(guildId: string): Promise<boolean> {
    return (
      (await this.redis.exists(RedisKeys.securityRestorePending(guildId))) === 1
    );
  }

  public async clearRestorePending(guildId: string): Promise<void> {
    await this.container.invalidation.invalidate(
      RedisKeys.securityRestorePending(guildId),
    );
  }

  /**
   * Recreates roles and channels present in the snapshot but missing from
   * the guild now. Best-effort: exact position/id can't be preserved (a
   * recreated role/channel gets a new Discord id), only name, permissions,
   * hierarchy-adjacent position, and (for channels) parent + overwrites.
   */
  public async restoreFromBackup(
    guild: Guild,
    backupId?: number,
  ): Promise<{ rolesRestored: number; channelsRestored: number } | null> {
    return restoreGuildFromBackup(guild, backupId);
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
    return withSerializedWork(panicLockKey(guild.id), async () => {
      const existing = await this.db.security.getPanicState(guild.id);
      if (existing) {
        return { invitesPaused: existing.invitesPaused, lockedCount: 0, skippedCount: 0 };
      }

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

      const targets = candidates.slice(0, PanicChannelCap);
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
        await Bun.sleep(PanicEditDelayMs);
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
    });
  }

  /** Restores invites and every channel overwrite snapshotted by `enterPanic`. */
  public async revertPanic(guild: Guild): Promise<PanicRevertResult | null> {
    return withSerializedWork(panicLockKey(guild.id), async () => {
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
        await Bun.sleep(PanicEditDelayMs);
      }

      await this.db.security.clearPanicState(guild.id);

      let restoredStructure: PanicRevertResult["restoredStructure"] = null;
      if (await this.isRestorePending(guild.id)) {
        restoredStructure = await this.restoreFromBackup(guild).catch(
          (err: unknown) => {
            this.logger.warn(
              `[security] Panic: auto-restore failed in ${guild.id}: ${String(err)}`,
            );
            return null;
          },
        );
        await this.clearRestorePending(guild.id);
      }

      return { restoredCount, restoredStructure };
    });
  }
}

declare module "#lib/module-system/Utility.js" {
  interface Utilities {
    security: SecurityUtility;
  }
}

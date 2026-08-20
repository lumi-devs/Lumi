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
import { Service, tryGetService } from "#lib/module-system/Service.js";
import { RedisKeys } from "#database/redis.js";
import { QuarantineAction } from "#lib/moderation/QuarantineAction.js";
import { logToChannel } from "#lib/moderation/log.js";
import { withSerializedWork } from "#lib/utilities/misc.js";
import type { LockedChannelSnapshot } from "#lib/prisma/repositories/SecurityRepository.js";
import {
  advanceCaptcha,
  buildChallenge,
  MAX_ATTEMPTS,
  type CaptchaOutcome,
  type CaptchaState,
} from "../lib/captcha.js";
import { snapshotGuild, type GuildBackupData } from "../lib/backup.js";
import { parseConfigList } from "#lib/module-system/config-schema.js";
import {
  hasNoAvatar,
  isUnverifiedBot,
  matchesUsernamePattern,
  hasAdvertisingIndicators,
  hasSimilarRecentJoiner,
  isCreationClustered,
  type RecentJoiner,
} from "../lib/join-heuristics.js";
import {
  getConfigNumber,
  getConfigString,
  getConfigAction,
} from "../lib/config-helpers.js";

export interface PanicResult {
  invitesPaused: boolean;
  lockedCount: number;
  skippedCount: number;
}

export interface PanicRevertResult {
  restoredCount: number;
  restoredStructure: { rolesRestored: number; channelsRestored: number } | null;
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
  | "webhook_create"
  | "vanity_change"
  | "dangerous_permission_grant"
  | "quarantine_bypass";

export interface AntiNukeConfig {
  enabled: boolean;
  windowSeconds: number;
  limits: Record<NukeKind, number>;
  response: "log" | "quarantine" | "ban";
  trustedRoleIds: string[];
}

export type GateAction = "log" | "kick" | "timeout" | "quarantine";

/** Severity order used to pick a single action when several filters trip at once. */
const GATE_ACTION_SEVERITY: Record<GateAction, number> = {
  log: 0,
  kick: 1,
  timeout: 2,
  quarantine: 3,
};

export type RaidAccountType = "all" | "suspicious";

export interface JoinGateFilterConfig {
  enabled: boolean;
  action: GateAction;
}

export interface JoinGateConfig {
  enabled: boolean;
  minAccountAgeHours: number;
  raidJoinCount: number;
  raidWindowSeconds: number;
  raidAction: GateAction;
  raidAccountType: RaidAccountType;
  raidWarnRoleIds: string[];
  filterNoAvatar: JoinGateFilterConfig;
  filterMinAge: JoinGateFilterConfig & { hours: number };
  filterUnverifiedBot: JoinGateFilterConfig;
  filterUsernamePattern: JoinGateFilterConfig & { patterns: string[] };
  filterAdvertising: JoinGateFilterConfig;
}

export interface JoinFilterResult {
  action: GateAction;
  triggered: string[];
}

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

const KIND_LIMIT_KEYS: Record<NukeKind, string> = {
  ban: "max_bans",
  kick: "max_kicks",
  channel_delete: "max_channel_deletes",
  role_delete: "max_role_deletes",
  webhook_create: "max_webhook_creates",
  vanity_change: "max_vanity_changes",
  dangerous_permission_grant: "max_permission_grants",
  quarantine_bypass: "max_quarantine_bypass",
};

/** Permissions that hand out server control - never allowed on `@everyone`. */
export const DANGEROUS_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
] as const;

const TRIPPED_COOLDOWN_SECONDS = 300;
const RAID_MODE_SECONDS = 600;
const GATE_TIMEOUT_MS = 60 * 60 * 1000;
const RECENT_JOINERS_CAP = 20;
const RECENT_JOINERS_TTL_SECONDS = 300;

function challengeLockKey(guildId: string, userId: string): string {
  return `security:verify-challenge:${guildId}:${userId}`;
}

function panicLockKey(guildId: string): string {
  return `security:panic:${guildId}`;
}

@ApplyOptions<Piece.Options>({ name: "security" })
export class SecurityService extends Service {
  public async loadAntiNukeConfig(guildId: string): Promise<AntiNukeConfig> {
    const raw = await this.db.config.getAllModuleConfig(guildId, "security");

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
      windowSeconds: getConfigNumber(raw, "window_seconds", 60),
      limits: {
        ban: getConfigNumber(raw, KIND_LIMIT_KEYS.ban, 5),
        kick: getConfigNumber(raw, KIND_LIMIT_KEYS.kick, 5),
        channel_delete: getConfigNumber(raw, KIND_LIMIT_KEYS.channel_delete, 3),
        role_delete: getConfigNumber(raw, KIND_LIMIT_KEYS.role_delete, 3),
        webhook_create: getConfigNumber(raw, KIND_LIMIT_KEYS.webhook_create, 3),
        vanity_change: getConfigNumber(raw, KIND_LIMIT_KEYS.vanity_change, 1),
        dangerous_permission_grant: getConfigNumber(
          raw,
          KIND_LIMIT_KEYS.dangerous_permission_grant,
          1,
        ),
        quarantine_bypass: getConfigNumber(raw, KIND_LIMIT_KEYS.quarantine_bypass, 1),
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
    const results = await this.redis
      .multi()
      .incr(key)
      .expire(key, config.windowSeconds, "NX")
      .exec();
    const count = results?.[0]?.[1] as number;
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
    const reason = `Anti-nuke: ${count} ${kind.replaceAll("_", " ")} actions in ${config.windowSeconds}s`;
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

  public async isQuarantined(guildId: string, userId: string): Promise<boolean> {
    return (
      (await this.redis.exists(RedisKeys.quarantineState(guildId, userId))) === 1
    );
  }

  public async loadJoinGateConfig(guildId: string): Promise<JoinGateConfig> {
    const raw = await this.db.config.getAllModuleConfig(guildId, "security");
    const legacyMinAge = getConfigNumber(raw, "min_account_age_hours", 0);

    return {
      enabled: raw["joingate_enabled"] === true,
      minAccountAgeHours: legacyMinAge,
      raidJoinCount: getConfigNumber(raw, "raid_join_count", 10),
      raidWindowSeconds: getConfigNumber(raw, "raid_window_seconds", 30),
      raidAction: getConfigAction(raw, "raid_action", "kick"),
      raidAccountType: raw["raid_account_type"] === "suspicious" ? "suspicious" : "all",
      raidWarnRoleIds: parseConfigList(raw["raid_warn_role_ids"]),
      filterNoAvatar: {
        enabled: raw["filter_no_avatar_enabled"] === true,
        action: getConfigAction(raw, "filter_no_avatar_action", "log"),
      },
      filterMinAge: {
        // legacy `min_account_age_hours` is the fallback default until reconfigured
        enabled: raw["filter_min_age_enabled"] === true,
        hours: getConfigNumber(raw, "filter_min_age_hours", legacyMinAge),
        action: getConfigAction(raw, "filter_min_age_action", "kick"),
      },
      filterUnverifiedBot: {
        enabled: raw["filter_unverified_bot_enabled"] === true,
        action: getConfigAction(raw, "filter_unverified_bot_action", "kick"),
      },
      filterUsernamePattern: {
        enabled: raw["filter_username_pattern_enabled"] === true,
        patterns: parseConfigList(raw["filter_username_pattern"]),
        action: getConfigAction(raw, "filter_username_pattern_action", "log"),
      },
      filterAdvertising: {
        enabled: raw["filter_advertising_enabled"] === true,
        action: getConfigAction(raw, "filter_advertising_action", "kick"),
      },
    };
  }

  /**
   * Runs every enabled join-gate filter against a member and returns the
   * single most severe triggered action (quarantine > timeout > kick > log),
   * or null when nothing tripped.
   */
  public evaluateJoinFilters(
    member: GuildMember,
    config: JoinGateConfig,
  ): JoinFilterResult | null {
    const triggered: string[] = [];
    let action: GateAction | null = null;
    const consider = (hit: boolean, filterAction: GateAction, label: string) => {
      if (!hit) return;
      triggered.push(label);
      if (action === null || GATE_ACTION_SEVERITY[filterAction] > GATE_ACTION_SEVERITY[action]) {
        action = filterAction;
      }
    };

    if (config.filterNoAvatar.enabled) {
      consider(hasNoAvatar(member.user), config.filterNoAvatar.action, "no avatar");
    }
    if (config.filterMinAge.enabled && config.filterMinAge.hours > 0) {
      const ageMs = Date.now() - member.user.createdTimestamp;
      consider(
        ageMs < config.filterMinAge.hours * 60 * 60 * 1000,
        config.filterMinAge.action,
        `account younger than ${config.filterMinAge.hours}h`,
      );
    }
    if (config.filterUnverifiedBot.enabled) {
      consider(isUnverifiedBot(member.user), config.filterUnverifiedBot.action, "unverified bot");
    }
    if (config.filterUsernamePattern.enabled && config.filterUsernamePattern.patterns.length > 0) {
      consider(
        matchesUsernamePattern(member.user.username, config.filterUsernamePattern.patterns),
        config.filterUsernamePattern.action,
        "username pattern match",
      );
    }
    if (config.filterAdvertising.enabled) {
      consider(
        hasAdvertisingIndicators(member.user),
        config.filterAdvertising.action,
        "advertising account",
      );
    }

    if (action === null) return null;
    return { action, triggered };
  }

  /** Tracks a joiner for the short-lived recent-joiners window used by the raid/similarity heuristics. */
  public async recordRecentJoiner(guildId: string, joiner: RecentJoiner): Promise<void> {
    const key = RedisKeys.recentJoiners(guildId);
    await this.redis
      .multi()
      .lpush(key, JSON.stringify(joiner))
      .ltrim(key, 0, RECENT_JOINERS_CAP - 1)
      .expire(key, RECENT_JOINERS_TTL_SECONDS)
      .exec();
  }

  public async getRecentJoiners(guildId: string): Promise<RecentJoiner[]> {
    const raw = await this.redis.lrange(RedisKeys.recentJoiners(guildId), 0, -1);
    return raw
      .map((r: string) => tryParseJSON(r) as RecentJoiner | null)
      .filter((j: RecentJoiner | null): j is RecentJoiner => j !== null);
  }

  /**
   * "Suspicious" scope for raid mode: no avatar, under the configured min
   * age, a username too close to a recent joiner's, or an unusual share of
   * recent joiners sharing this account's creation day - any one is enough,
   * this doesn't need to be a tunable score.
   */
  public async isSuspiciousJoiner(
    member: GuildMember,
    config: JoinGateConfig,
  ): Promise<boolean> {
    if (hasNoAvatar(member.user)) return true;
    const minAgeHours = config.filterMinAge.hours > 0 ? config.filterMinAge.hours : 24;
    if (Date.now() - member.user.createdTimestamp < minAgeHours * 60 * 60 * 1000) return true;

    const recent = await this.getRecentJoiners(member.guild.id);
    if (hasSimilarRecentJoiner(member.user.username, recent)) return true;
    if (isCreationClustered(member.user.createdTimestamp, recent)) return true;
    return false;
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
    const results = await this.redis
      .multi()
      .incr(key)
      .expire(key, config.raidWindowSeconds, "NX")
      .exec();
    const count = results?.[0]?.[1] as number;
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

  public async applyGateAction(
    guild: Guild,
    memberId: string,
    action: GateAction,
    reason: string,
  ): Promise<boolean> {
    const botUser = this.container.client.user;
    if (isNullish(botUser)) return false;

    if (action === "log") {
      const logService = tryGetService("guild-log");
      await logService?.dispatch({
        guildId: guild.id,
        moduleName: "security",
        action: "📝 Gate Logged",
        targetId: memberId,
        actorId: botUser.id,
        reason,
        color: Colors.Yellow,
      });
      return true;
    }

    const member = await guild.members.fetch(memberId).catch(() => null);
    if (isNullish(member)) return false;

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
    await this.redis.del(RedisKeys.securityRestorePending(guildId));
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
    const row = backupId
      ? await this.db.security.getBackup(backupId)
      : await this.db.security.getLatestBackup(guild.id);
    if (!row || row.guildId !== guild.id) return null;

    const data = row.data as unknown as GuildBackupData;
    let rolesRestored = 0;
    const roleIdMap = new Map<string, string>();

    for (const role of data.roles) {
      if (guild.roles.cache.has(role.id)) {
        roleIdMap.set(role.id, role.id);
        continue;
      }
      try {
        const created = await guild.roles.create({
          name: role.name,
          color: role.color,
          permissions: BigInt(role.permissions),
          hoist: role.hoist,
          mentionable: role.mentionable,
          position: role.position,
          reason: "Security: restoring from backup",
        });
        roleIdMap.set(role.id, created.id);
        rolesRestored++;
      } catch (err: unknown) {
        this.logger.warn(
          `[security] Restore: failed to recreate role ${role.name} in ${guild.id}: ${String(err)}`,
        );
      }
    }

    let channelsRestored = 0;
    // Categories first so child channels can resolve `parentId`.
    const ordered = [...data.channels].sort((a, b) =>
      a.type === ChannelType.GuildCategory ? -1 : b.type === ChannelType.GuildCategory ? 1 : 0,
    );
    const channelIdMap = new Map<string, string>();

    for (const channel of ordered) {
      if (guild.channels.cache.has(channel.id)) {
        channelIdMap.set(channel.id, channel.id);
        continue;
      }
      try {
        const parentId = channel.parentId
          ? (channelIdMap.get(channel.parentId) ??
              guild.channels.cache.get(channel.parentId)?.id ??
              null)
          : null;
        const created = await guild.channels.create({
          name: channel.name,
          type: channel.type as never,
          parent: parentId,
          position: channel.position,
          permissionOverwrites: channel.overwrites.map((ow) => ({
            id: roleIdMap.get(ow.id) ?? ow.id,
            type: ow.type,
            allow: BigInt(ow.allow),
            deny: BigInt(ow.deny),
          })),
          reason: "Security: restoring from backup",
        });
        channelIdMap.set(channel.id, (created as { id: string }).id);
        channelsRestored++;
      } catch (err: unknown) {
        this.logger.warn(
          `[security] Restore: failed to recreate channel ${channel.name} in ${guild.id}: ${String(err)}`,
        );
      }
    }

    return { rolesRestored, channelsRestored };
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
        await sleep(PANIC_EDIT_DELAY_MS);
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

declare module "#lib/module-system/Service.js" {
  interface Services {
    security: SecurityService;
  }
}

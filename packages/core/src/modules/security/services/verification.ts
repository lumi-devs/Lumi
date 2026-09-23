import { container } from "@sapphire/framework";
import {
  ChannelType,
  type Guild,
  type GuildMember,
  type GuildTextBasedChannel,
} from "discord.js";
import { isNullish, tryParseJSON } from "@sapphire/utilities";
import { fetchTyped } from "#lib/commands.js";
import { RedisKeys } from "#lib/database/redis.js";
import { withSerializedWork } from "#lib/utilities/misc.js";
import {
  advanceCaptcha,
  buildChallenge,
  MaxAttempts,
  type CaptchaOutcome,
  type CaptchaState,
} from "./captcha.js";
import { getConfigNumber, getConfigString } from "./config-helpers.js";
import { buildVerifyPanel, type VerifyPanelContent } from "../ui/verify-panel.js";

export interface VerifyPanelSetResult {
  channelId: string;
  messageId: string;
  posted: boolean;
  edited: boolean;
  moved: boolean;
  createdChannel: boolean;
  oldMessageDeleted: boolean;
}

type VerificationMode = "emoji" | "none" | "web";
type VerificationTarget = "everyone" | "suspicious";

export interface VerificationConfig {
  enabled: boolean;
  mode: VerificationMode;
  target: VerificationTarget;
  verifiedRoleId: string | null;
  pendingRoleId: string | null;
  timeoutMinutes: number;
  kickOnTimeout: boolean;
}

function challengeLockKey(guildId: string, userId: string): string {
  return `security:verify-challenge:${guildId}:${userId}`;
}

export async function loadVerificationConfig(
  guildId: string,
): Promise<VerificationConfig> {
  const raw = await container.db.config.getAllModuleConfig(guildId, "security");
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

async function loadVerifyPanelContent(guildId: string): Promise<VerifyPanelContent> {
  const raw = await container.db.config.getAllModuleConfig(guildId, "security");
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
export async function postOrEditVerifyPanel(
  guild: Guild,
  opts: {
    channelId?: string;
    createChannel?: boolean;
    deleteOldMessage?: boolean;
  },
): Promise<VerifyPanelSetResult> {
  const config = await loadVerificationConfig(guild.id);
  if (!config.enabled || !config.verifiedRoleId) {
    throw new Error(
      "Turn on Verification and pick a Verified Role before posting the panel.",
    );
  }

  const existing = await container.db.security.getVerificationPanel(guild.id);

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
  const content = await loadVerifyPanelContent(guild.id);
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
        container.logger.warn(
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
  await container.db.security.saveVerificationPanel({
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
export async function startChallenge(
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
  await container.redis
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

async function getChallenge(
  guildId: string,
  userId: string,
): Promise<CaptchaState | null> {
  const raw = await container.redis.get(RedisKeys.verifyChallenge(guildId, userId));
  if (isNullish(raw)) return null;
  return tryParseJSON(raw) as CaptchaState | null;
}

async function saveChallenge(
  guildId: string,
  userId: string,
  state: CaptchaState,
): Promise<void> {
  await container.redis.set(
    RedisKeys.verifyChallenge(guildId, userId),
    JSON.stringify(state),
    "EXAT",
    Math.floor(state.expiresAt / 1000),
  );
}

export async function advanceChallenge(
  guildId: string,
  userId: string,
  clickedIdx: number,
): Promise<{ state: CaptchaState; outcome: CaptchaOutcome } | null> {
  return withSerializedWork(challengeLockKey(guildId, userId), async () => {
    const state = await getChallenge(guildId, userId);
    if (isNullish(state)) return null;

    const result = advanceCaptcha(state, clickedIdx);
    if (result.outcome === "solved" || result.outcome === "failed") {
      await clearChallenge(guildId, userId);
    } else {
      await saveChallenge(guildId, userId, result.state);
    }
    return result;
  });
}

/** Drops all pending state for a member (on success or failure). */
async function clearChallenge(guildId: string, userId: string): Promise<void> {
  await container.invalidation.invalidate(
    RedisKeys.verifyChallenge(guildId, userId),
  );
  await container.redis.zrem(RedisKeys.verifyPending(guildId), userId);
}

/** Grants the verified role and strips the pending role once a member passes. */
export async function grantVerified(guild: Guild, userId: string): Promise<boolean> {
  const config = await loadVerificationConfig(guild.id);
  if (isNullish(config.verifiedRoleId)) return false;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (isNullish(member)) return false;
  try {
    const nextRoles = new Set(member.roles.cache.keys());
    nextRoles.add(config.verifiedRoleId);
    if (config.pendingRoleId) nextRoles.delete(config.pendingRoleId);
    await member.roles.set([...nextRoles], "Verification passed");
  } catch (err: unknown) {
    container.logger.warn(
      `[security] Verify role grant failed for ${userId} in ${guild.id}: ${String(err)}`,
    );
    return false;
  }
  return true;
}

/** Assigns the pending role on join and starts the timeout clock. */
export async function assignPending(
  member: GuildMember,
  config: VerificationConfig,
): Promise<void> {
  if (config.pendingRoleId) {
    await member.roles
      .add(config.pendingRoleId, "Awaiting verification")
      .catch(() => null);
  }
  const expiresAt = Date.now() + config.timeoutMinutes * 60 * 1000;
  await container.redis.zadd(
    RedisKeys.verifyPending(member.guild.id),
    expiresAt,
    member.id,
  );
}

/**
 * Kicks (or just clears) members whose verification window elapsed. Called by
 * the periodic sweep; safe to run on any worker holding the guild.
 */
export async function sweepExpiredPending(guild: Guild): Promise<void> {
  const config = await loadVerificationConfig(guild.id);
  if (!config.enabled) return;
  const expired = await container.redis.zrangebyscore(
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
    await clearChallenge(guild.id, userId);
  }
}

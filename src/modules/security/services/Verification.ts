import { container, type Container } from "#src/lib/Services.js";
import { ChannelType, type Guild, type GuildMember } from "discord.js";
import { Routes, type APIChannel, type APIMessage } from "discord-api-types/v10";
import { isNullish, tryParseJSON } from "#src/shared/Index.ts";
import { fetchTyped } from "#src/lib/i18n/Index.js";
import { ValkeyKeys } from "#src/lib/valkey/Client.js";
import {
  fetchChannelMessageRest,
  fetchChannelRest,
  fetchGuildMemberRestUncached,
  fetchGuildRest,
  GuildTextBasedChannelTypes,
} from "#src/lib/rpc/DiscordRestLookup.js";
import { serializeCard } from "#src/lib/rpc/CardSerialize.js";
import { withSerializedWork } from "#src/lib/utilities/SerializedWork.js";
import {
  advanceCaptcha,
  buildChallenge,
  MaxAttempts,
  type CaptchaOutcome,
  type CaptchaState,
} from "#src/modules/security/services/Captcha.js";
import { getConfigNumber, getConfigString } from "#src/modules/security/services/ConfigHelpers.js";
import { buildVerifyPanel, type VerifyPanelContent } from "#src/modules/security/ui/VerifyPanel.js";

interface VerifyPanelSetResult {
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

interface VerificationConfig {
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
  guildIdOrServices: Container | string,
  maybeGuildId?: string,
): Promise<VerificationConfig> {
  const [services, guildId] = typeof guildIdOrServices === "string"
    ? [container, guildIdOrServices]
    : [guildIdOrServices, maybeGuildId!];
  const raw = await services.db.config.getAllModuleConfig(guildId, "security");
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

async function loadVerifyPanelContent(services: Container, guildId: string): Promise<VerifyPanelContent> {
  const raw = await services.db.config.getAllModuleConfig(guildId, "security");
  return {
    title: getConfigString(raw, "verification_panel_title"),
    welcome: getConfigString(raw, "verification_panel_welcome"),
    footer: getConfigString(raw, "verification_panel_footer"),
  };
}

function isSendableGuildChannel(
  channel: APIChannel | null,
  guildId: string,
): boolean {
  return (
    channel !== null &&
    "guild_id" in channel &&
    channel.guild_id === guildId &&
    GuildTextBasedChannelTypes.has(channel.type)
  );
}

export async function postOrEditVerifyPanel(
  services: Container,
  guildId: string,
  opts: {
    channelId?: string;
    createChannel?: boolean;
    deleteOldMessage?: boolean;
  },
): Promise<VerifyPanelSetResult> {
  const config = await loadVerificationConfig(services, guildId);
  if (!config.enabled || !config.verifiedRoleId) {
    throw new Error(
      "Turn on Verification and pick a Verified Role before posting the panel.",
    );
  }

  const existing = await services.db.security.getVerificationPanel(guildId);

  let targetChannelId: string;
  let createdChannel = false;
  if (opts.createChannel) {
    const created = (await services.client.rest.post(Routes.guildChannels(guildId), {
      body: { name: "verify-here", type: ChannelType.GuildText },
      reason: "Dashboard: verification panel channel",
    })) as APIChannel;
    targetChannelId = created.id;
    createdChannel = true;
  } else {
    if (!opts.channelId) throw new Error("channelId is required");
    const channel = await fetchChannelRest(opts.channelId);
    if (!isSendableGuildChannel(channel, guildId)) {
      throw new Error(
        "That channel doesn't exist or isn't a text channel Lumi can post in.",
      );
    }
    targetChannelId = opts.channelId;
  }

  const guildData = await fetchGuildRest(guildId);
  const t = await fetchTyped(
    {
      guild: { id: guildId, preferredLocale: guildData?.preferred_locale },
    } as unknown as Parameters<typeof fetchTyped>[0],
    services,
  );
  const content = await loadVerifyPanelContent(services, guildId);
  const card = buildVerifyPanel(t, content);
  const body = serializeCard(card);

  const movedChannel = Boolean(existing) && existing!.channelId !== targetChannelId;

  if (existing && !movedChannel) {
    const message = await fetchChannelMessageRest(targetChannelId, existing.messageId);
    if (message) {
      try {
        await services.client.rest.patch(
          Routes.channelMessage(targetChannelId, message.id),
          { body },
        );
        return {
          channelId: targetChannelId,
          messageId: message.id,
          posted: false,
          edited: true,
          moved: false,
          createdChannel,
          oldMessageDeleted: false,
        };
      } catch (err: unknown) {
        services.logger.warn(
          `[security] Verify panel edit failed in ${guildId}, posting fresh instead: ${String(err)}`,
        );
      }
    }
  }

  let oldMessageDeleted = false;
  if (existing && movedChannel && opts.deleteOldMessage) {
    const oldChannel = await fetchChannelRest(existing.channelId);
    if (isSendableGuildChannel(oldChannel, guildId)) {
      const oldMessage = await fetchChannelMessageRest(
        existing.channelId,
        existing.messageId,
      );
      if (oldMessage) {
        await services.client.rest
          .delete(Routes.channelMessage(existing.channelId, existing.messageId))
          .catch(() => null);
        oldMessageDeleted = true;
      }
    }
  }

  const sent = (await services.client.rest.post(Routes.channelMessages(targetChannelId), {
    body,
  })) as APIMessage;
  await services.db.security.saveVerificationPanel({
    guildId,
    channelId: targetChannelId,
    messageId: sent.id,
  });

  return {
    channelId: targetChannelId,
    messageId: sent.id,
    posted: true,
    edited: false,
    moved: movedChannel,
    createdChannel,
    oldMessageDeleted,
  };
}

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
  await container.valkey
    .multi()
    .set(
      ValkeyKeys.verifyChallenge(guildId, userId),
      JSON.stringify(state),
      "EXAT",
      Math.floor(expiresAt / 1000),
    )
    .zadd(ValkeyKeys.verifyPending(guildId), expiresAt, userId)
    .exec();
  return state;
}

async function getChallenge(
  guildId: string,
  userId: string,
): Promise<CaptchaState | null> {
  const raw = await container.valkey.get(ValkeyKeys.verifyChallenge(guildId, userId));
  if (isNullish(raw)) return null;
  return tryParseJSON(raw) as CaptchaState | null;
}

async function saveChallenge(
  guildId: string,
  userId: string,
  state: CaptchaState,
): Promise<void> {
  await container.valkey.set(
    ValkeyKeys.verifyChallenge(guildId, userId),
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

async function clearChallenge(guildId: string, userId: string): Promise<void> {
  await container.invalidation.invalidate(
    ValkeyKeys.verifyChallenge(guildId, userId),
  );
  await container.valkey.zrem(ValkeyKeys.verifyPending(guildId), userId);
}

export async function grantVerified(guildId: string, userId: string): Promise<boolean> {
  const config = await loadVerificationConfig(guildId);
  if (isNullish(config.verifiedRoleId)) return false;
  const member = await fetchGuildMemberRestUncached(guildId, userId);
  if (isNullish(member)) return false;
  try {
    const nextRoles = new Set(member.roles);
    nextRoles.add(guildId);
    nextRoles.add(config.verifiedRoleId);
    if (config.pendingRoleId) nextRoles.delete(config.pendingRoleId);
    await container.client.rest.patch(Routes.guildMember(guildId, userId), {
      body: { roles: [...nextRoles] },
      reason: "Verification passed",
    });
  } catch (err: unknown) {
    container.logger.warn(
      `[security] Verify role grant failed for ${userId} in ${guildId}: ${String(err)}`,
    );
    return false;
  }
  return true;
}

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
  await container.valkey.zadd(
    ValkeyKeys.verifyPending(member.guild.id),
    expiresAt,
    member.id,
  );
}

export async function sweepExpiredPending(
  guildOrServices: Container | Guild,
  maybeGuild?: Guild,
): Promise<void> {
  const [services, guild] = "client" in guildOrServices
    ? [guildOrServices as Container, maybeGuild!]
    : [container, guildOrServices as Guild];
  const config = await loadVerificationConfig(services, guild.id);
  if (!config.enabled) return;
  const expired = await services.valkey.zrangebyscore(
    ValkeyKeys.verifyPending(guild.id),
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

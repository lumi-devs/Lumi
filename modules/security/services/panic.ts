import { ChannelType, GuildFeature, PermissionFlagsBits, Routes, type Guild } from "discord.js";
import type { LumiServices } from "@lumi/module-kit";
import { withLock } from "@lumi/redis";
import { getSecurityConfig } from "./config.ts";

const PanicChannelCap = 40;
const PanicEditDelayMs = 300;
const PanicLockTtlMs = 120_000;

export interface PanicResult {
  readonly alreadyActive: boolean;
  readonly startedAt?: Date | undefined;
  readonly invitesPaused: boolean;
  readonly lockedCount: number;
  readonly skippedCount: number;
}

export interface PanicRevertResult {
  readonly restoredCount: number;
  readonly invitesResumed: boolean;
}

function panicLockKey(services: LumiServices, guildId: string): string {
  return services.keys.cooldown("panic-lock", guildId);
}

function everyoneSendMessages(channel: {
  permissionOverwrites: {
    cache: Map<string, { allow: { has(bit: bigint): boolean }; deny: { has(bit: bigint): boolean } }>;
  };
}, guildId: string): boolean | null {
  const overwrite = channel.permissionOverwrites.cache.get(guildId);
  if (!overwrite) return null;
  if (overwrite.allow.has(PermissionFlagsBits.SendMessages)) return true;
  if (overwrite.deny.has(PermissionFlagsBits.SendMessages)) return false;
  return null;
}

async function setInvitesDisabled(
  services: LumiServices,
  guild: Guild,
  disabled: boolean,
): Promise<boolean> {
  try {
    const features = new Set<string>(guild.features);
    if (disabled) features.add(GuildFeature.InvitesDisabled);
    else features.delete(GuildFeature.InvitesDisabled);
    await services.client.rest.patch(Routes.guild(guild.id), {
      body: { features: [...features] },
    });
    return true;
  } catch (error) {
    services.logger.warn(
      { error, guildId: guild.id },
      disabled ? "failed to pause invites during panic" : "failed to resume invites after panic",
    );
    return false;
  }
}

export async function enterPanic(
  services: LumiServices,
  guild: Guild,
  actorId: string,
): Promise<PanicResult> {
  const locked = await withLock(services.redis, panicLockKey(services, guild.id), PanicLockTtlMs, async () => {
    const existing = await services.db.security.getPanicState(guild.id);
    if (existing) {
      return {
        alreadyActive: true,
        startedAt: existing.startedAt,
        invitesPaused: existing.invitesPaused,
        lockedCount: 0,
        skippedCount: 0,
      };
    }

    const config = await getSecurityConfig(services, guild.id).catch(() => null);
    const invitesPaused = await setInvitesDisabled(services, guild, true);

    const all = await guild.channels.fetch();
    const configured = new Set(config?.panic_lock_channel_ids ?? []);
    const candidates = [...all.values()].filter((channel) => {
      if (!channel) return false;
      if (configured.size > 0) return configured.has(channel.id);
      return channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
    });
    const targets = candidates.slice(0, PanicChannelCap);

    const snapshot: Record<string, boolean | null> = {};
    let lockedCount = 0;

    for (const channel of targets) {
      if (!channel) continue;
      snapshot[channel.id] = everyoneSendMessages(channel, guild.id);
      try {
        await channel.permissionOverwrites.edit(
          guild.id,
          { SendMessages: false },
          { reason: `Panic mode activated by ${actorId}` },
        );
        lockedCount++;
      } catch (error) {
        services.logger.warn(
          { error, guildId: guild.id, channelId: channel.id },
          "failed to lock channel during panic",
        );
      }
      await Bun.sleep(PanicEditDelayMs);
    }

    await services.db.security.savePanicState({
      guildId: guild.id,
      actorId,
      invitesPaused,
      lockedChannels: snapshot,
    });

    return {
      alreadyActive: false,
      invitesPaused,
      lockedCount,
      skippedCount: targets.length - lockedCount,
    };
  });

  if (!locked.acquired) {
    throw new Error("Another panic operation is already running. Try again in a moment.");
  }
  return locked.value;
}

export async function revertPanic(
  services: LumiServices,
  guild: Guild,
): Promise<PanicRevertResult | null> {
  const locked = await withLock(services.redis, panicLockKey(services, guild.id), PanicLockTtlMs, async () => {
    const state = await services.db.security.getPanicState(guild.id);
    if (!state) return null;

    let invitesResumed = true;
    if (state.invitesPaused) {
      invitesResumed = await setInvitesDisabled(services, guild, false);
    }

    const snapshot = (state.lockedChannels ?? {}) as Record<string, boolean | null>;
    const all = await guild.channels.fetch();
    let restoredCount = 0;

    for (const [channelId, prior] of Object.entries(snapshot)) {
      const channel = all.get(channelId);
      if (!channel) continue;
      try {
        await channel.permissionOverwrites.edit(
          guild.id,
          { SendMessages: prior },
          { reason: "Panic mode reverted" },
        );
        restoredCount++;
      } catch (error) {
        services.logger.warn(
          { error, guildId: guild.id, channelId },
          "failed to restore channel after panic",
        );
      }
      await Bun.sleep(PanicEditDelayMs);
    }

    await services.db.security.clearPanicState(guild.id);
    return { restoredCount, invitesResumed };
  });

  if (!locked.acquired) {
    throw new Error("Another panic operation is already running. Try again in a moment.");
  }
  return locked.value;
}

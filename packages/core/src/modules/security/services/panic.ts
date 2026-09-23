import { container } from "@sapphire/framework";
import { ChannelType, PermissionFlagsBits, type Guild } from "discord.js";
import { withSerializedWork } from "#lib/utilities/misc.js";
import type { LockedChannelSnapshot } from "#lib/prisma/repositories/SecurityRepository.js";
import { isRestorePending, restoreFromBackup, clearRestorePending } from "./backup.js";

export interface PanicResult {
  invitesPaused: boolean;
  lockedCount: number;
  skippedCount: number;
}

export interface PanicRevertResult {
  restoredCount: number;
  restoredStructure: { rolesRestored: number; channelsRestored: number } | null;
}

const PanicChannelCap = 40;
const PanicEditDelayMs = 300;

function panicLockKey(guildId: string): string {
  return `security:panic:${guildId}`;
}

/**
 * Activates panic mode: pauses invites and locks `@everyone` SendMessages
 * across the guild's text channels (or a configured subset), snapshotting
 * prior overwrites so `revertPanic` can restore them exactly.
 */
export async function enterPanic(
  guild: Guild,
  actorId: string,
  channelIds: string[],
): Promise<PanicResult> {
  return withSerializedWork(panicLockKey(guild.id), async () => {
    const existing = await container.db.security.getPanicState(guild.id);
    if (existing) {
      return { invitesPaused: existing.invitesPaused, lockedCount: 0, skippedCount: 0 };
    }

    let invitesPaused = false;
    try {
      await guild.disableInvites(true);
      invitesPaused = true;
    } catch (err: unknown) {
      container.logger.warn(
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
        container.logger.warn(
          `[security] Panic: failed to lock channel ${channel.id} in ${guild.id}: ${String(err)}`,
        );
      }
      await Bun.sleep(PanicEditDelayMs);
    }

    await container.db.security.savePanicState({
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
export async function revertPanic(guild: Guild): Promise<PanicRevertResult | null> {
  return withSerializedWork(panicLockKey(guild.id), async () => {
    const state = await container.db.security.getPanicState(guild.id);
    if (!state) return null;

    if (state.invitesPaused) {
      await guild.disableInvites(false).catch((err: unknown) => {
        container.logger.warn(
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
        container.logger.warn(
          `[security] Panic: failed to restore channel ${channelId} in ${guild.id}: ${String(err)}`,
        );
      }
      await Bun.sleep(PanicEditDelayMs);
    }

    await container.db.security.clearPanicState(guild.id);

    let restoredStructure: PanicRevertResult["restoredStructure"] = null;
    if (await isRestorePending(guild.id)) {
      restoredStructure = await restoreFromBackup(guild).catch(
        (err: unknown) => {
          container.logger.warn(
            `[security] Panic: auto-restore failed in ${guild.id}: ${String(err)}`,
          );
          return null;
        },
      );
      await clearRestorePending(guild.id);
    }

    return { restoredCount, restoredStructure };
  });
}

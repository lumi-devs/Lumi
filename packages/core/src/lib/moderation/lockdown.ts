import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type NewsChannel,
  type TextChannel,
} from "discord.js";
import { mapWithConcurrency } from "#lib/utilities/concurrency.js";

/** A channel type with a `permissionOverwrites` manager - what `/lock` and `/lockdown` operate on. */
export type LockableChannel = TextChannel | NewsChannel;

export interface LockdownResult {
  modified: number;
  failed: number;
}

/**
 * Lockdown is the emergency brake during a raid, so the time it takes is the
 * time the raid keeps running in whatever is still open. Editing channels one
 * at a time made that proportional to the channel count; this caps concurrent
 * edits instead of serializing them.
 */
const LockdownConcurrency = 10;

async function setEveryoneSendMessages(
  guild: Guild,
  value: false | null,
): Promise<LockdownResult> {
  const channels = await guild.channels.fetch();
  const text = [...channels.values()].filter(
    (c) => c !== null && c.type === ChannelType.GuildText,
  );

  let modified = 0;
  let failed = 0;

  await mapWithConcurrency(text, LockdownConcurrency, async (channel) => {
    try {
      await channel.permissionOverwrites.edit(guild.id, {
        SendMessages: value,
      });
      modified++;
    } catch {
      failed++;
    }
  });

  return { modified, failed };
}

/** Denies @everyone SendMessages on every text channel. Shared by `/lockdown` and auto-lockdown. */
export function lockAllTextChannels(guild: Guild): Promise<LockdownResult> {
  return setEveryoneSendMessages(guild, false);
}

/** Clears the @everyone SendMessages override set by `lockAllTextChannels`. */
export function unlockAllTextChannels(guild: Guild): Promise<LockdownResult> {
  return setEveryoneSendMessages(guild, null);
}

/** Whether @everyone is currently denied SendMessages on this one channel. */
export function isChannelLocked(channel: LockableChannel): boolean {
  const overwrite = channel.permissionOverwrites.cache.get(channel.guild.id);
  return overwrite?.deny.has(PermissionFlagsBits.SendMessages) ?? false;
}

/** Denies @everyone SendMessages on one channel. Distinct from server-wide `lockAllTextChannels`. */
export async function lockChannel(
  channel: LockableChannel,
  reason?: string,
): Promise<void> {
  await channel.permissionOverwrites.edit(
    channel.guild.id,
    { SendMessages: false },
    { reason },
  );
}

/** Clears the @everyone SendMessages override set by `lockChannel`. */
export async function unlockChannel(
  channel: LockableChannel,
  reason?: string,
): Promise<void> {
  await channel.permissionOverwrites.edit(
    channel.guild.id,
    { SendMessages: null },
    { reason },
  );
}

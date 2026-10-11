import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type NewsChannel,
  type TextChannel,
} from "discord.js";
import { mapWithConcurrency } from "#src/lib/utilities/Concurrency.js";

export type LockableChannel = TextChannel | NewsChannel;

export interface LockdownResult {
  modified: number;
  failed: number;
}

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

export function lockAllTextChannels(guild: Guild): Promise<LockdownResult> {
  return setEveryoneSendMessages(guild, false);
}

export function unlockAllTextChannels(guild: Guild): Promise<LockdownResult> {
  return setEveryoneSendMessages(guild, null);
}

export function isChannelLocked(channel: LockableChannel): boolean {
  const overwrite = channel.permissionOverwrites.cache.get(channel.guild.id);
  return overwrite?.deny.has(PermissionFlagsBits.SendMessages) ?? false;
}

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

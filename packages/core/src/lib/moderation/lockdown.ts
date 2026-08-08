import { ChannelType, type Guild } from "discord.js";

export interface LockdownResult {
  modified: number;
  failed: number;
}

/** Denies @everyone SendMessages on every text channel. Shared by `/lockdown` and auto-lockdown. */
export async function lockAllTextChannels(guild: Guild): Promise<LockdownResult> {
  let modified = 0;
  let failed = 0;
  const channels = await guild.channels.fetch();
  for (const channel of channels.values()) {
    if (channel && channel.type === ChannelType.GuildText) {
      try {
        await channel.permissionOverwrites.edit(guild.id, { SendMessages: false });
        modified++;
      } catch {
        failed++;
      }
    }
  }
  return { modified, failed };
}

/** Clears the @everyone SendMessages override set by `lockAllTextChannels`. */
export async function unlockAllTextChannels(guild: Guild): Promise<LockdownResult> {
  let modified = 0;
  let failed = 0;
  const channels = await guild.channels.fetch();
  for (const channel of channels.values()) {
    if (channel && channel.type === ChannelType.GuildText) {
      try {
        await channel.permissionOverwrites.edit(guild.id, { SendMessages: null });
        modified++;
      } catch {
        failed++;
      }
    }
  }
  return { modified, failed };
}

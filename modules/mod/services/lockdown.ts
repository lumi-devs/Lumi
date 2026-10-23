import { ChannelType, type Guild } from "discord.js";

export interface LockdownResult {
  modified: number;
  failed: number;
}

const Concurrency = 10;

async function setEveryoneSendMessages(
  guild: Guild,
  value: false | null,
): Promise<LockdownResult> {
  const channels = await guild.channels.fetch();
  const text = [...channels.values()].filter(
    (channel) => channel !== null && channel.type === ChannelType.GuildText,
  );

  let modified = 0;
  let failed = 0;

  for (let index = 0; index < text.length; index += Concurrency) {
    const slice = text.slice(index, index + Concurrency);
    await Promise.all(
      slice.map(async (channel) => {
        if (!channel) return;
        try {
          await channel.permissionOverwrites.edit(guild.id, { SendMessages: value });
          modified++;
        } catch {
          failed++;
        }
      }),
    );
  }

  return { modified, failed };
}

export function lockAllTextChannels(guild: Guild): Promise<LockdownResult> {
  return setEveryoneSendMessages(guild, false);
}

export function unlockAllTextChannels(guild: Guild): Promise<LockdownResult> {
  return setEveryoneSendMessages(guild, null);
}

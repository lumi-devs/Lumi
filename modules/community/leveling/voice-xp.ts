import type { Guild, GuildMember } from "discord.js";
import { rolesEarnXp, type LevelingConfig } from "./config.js";
import { grantXp } from "./level-up.js";

export async function grantVoiceXp(
  services: any,
  guild: Guild,
  member: GuildMember,
  minutes: number,
  config: LevelingConfig,
): Promise<void> {
  if (!rolesEarnXp(config, member.roles.cache.keys())) return;

  const amount = Math.max(
    1,
    Math.round(
      config.voiceXpPerMinute * minutes * config.globalMultiplier,
    ),
  );

  await grantXp(services, config, {
    guildId: guild.id,
    userId: member.id,
    amount,
    member,
    guild,
    voiceMinutes: minutes,
    fallbackChannelId: member.voice.channelId,
  });
}

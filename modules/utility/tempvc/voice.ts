import { ChannelType, type VoiceChannel, type VoiceState } from "discord.js";
import {
  createTempVoiceChannel,
  deleteTempVoiceChannel,
  findTempChannel,
  updateTempRecord,
} from "./panel.js";
import { getTempVcConfig, isModuleEnabled } from "./config.js";

export async function handleVoiceStateChange(
  oldState: VoiceState,
  newState: VoiceState,
  services: any,
): Promise<void> {
  const guildId = newState.guild?.id ?? oldState.guild?.id;
  if (!guildId || !isModuleEnabled(services, guildId)) return;
  const config = await getTempVcConfig(services, guildId);

  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    const record = await findTempChannel(services, oldState.channelId);
    if (record && record.guildId === guildId) {
      if (oldState.member?.id === record.ownerId && config.ownerLeaveDelete) {
        const deleted = await deleteTempVoiceChannel(
          services,
          guildId,
          oldState.channelId,
        );
        if (!deleted) {
          await updateTempRecord(services, oldState.channelId, {
            expiresAt: new Date(Date.now() + config.emptyTimeoutMs),
          });
        }
      } else {
        const channel = oldState.guild?.channels.cache.get(oldState.channelId);
        if (
          channel &&
          channel.type === ChannelType.GuildVoice &&
          (channel as VoiceChannel).members.size === 0
        ) {
          await updateTempRecord(services, oldState.channelId, {
            expiresAt: new Date(Date.now() + config.emptyTimeoutMs),
          });
        }
      }
    }
  }

  if (!newState.channelId || oldState.channelId === newState.channelId) return;

  const generator = config.generators.find(
    (item) => item.channelId === newState.channelId,
  );
  if (generator && newState.member) {
    await createTempVoiceChannel(
      services,
      guildId,
      newState.member,
      config,
      generator,
    );
    return;
  }

  const joined = await findTempChannel(services, newState.channelId);
  if (joined && joined.guildId === guildId) {
    await updateTempRecord(services, newState.channelId, { expiresAt: null });
  }
}

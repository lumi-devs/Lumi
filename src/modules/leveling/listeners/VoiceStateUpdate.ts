import { Events } from "discord.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import type { Container } from "#src/lib/Services.js";
import type { VoiceState } from "discord.js";
import { getLevelingConfig } from "#src/modules/leveling/Config.js";
import { LevelingModuleName } from "#src/modules/leveling/Constants.js";
import { LevelService } from "#src/modules/leveling/services/LevelService.js";

async function isAudible(state: VoiceState): Promise<boolean> {
  if (!state.channelId) return false;
  if (state.mute || state.deaf || state.selfMute || state.selfDeaf) return false;
  if (state.suppress) return false;
  const member = state.member;
  if (!member || member.user.bot) return false;
  const channel =
    state.channel ?? (await state.guild.channels.fetch(state.channelId).catch(() => null));
  if (!channel || !channel.isVoiceBased()) return false;
  let humans = 0;
  for (const other of channel.members.values()) {
    if (!other.user.bot && ++humans > 1) return true;
  }
  return false;
}

export const levelingVoiceStateUpdateListener = defineListener({
  name: "levelingVoiceStateUpdate",
  event: Events.VoiceStateUpdate,
  async execute(
    services: Container,
    oldState: VoiceState,
    newState: VoiceState,
  ): Promise<void> {
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) return;
    const guild = newState.guild ?? oldState.guild;
    const guildId = guild.id;
    if (!(await services.db.modules.isModuleEnabled(guildId, LevelingModuleName)))
      return;
    const config = await getLevelingConfig(services, guildId);
    if (!config.voiceEnabled) return;
    const [was, is] = await Promise.all([
      isAudible(oldState),
      isAudible(newState),
    ]);
    if (was === is) return;
    const service = new LevelService();
    if (is) {
      service.voiceSessionStart(guildId, member.id, Date.now());
      return;
    }
    const elapsed = service.voiceSessionEnd(guildId, member.id, Date.now());
    if (elapsed === null) return;
    const minutes = Math.floor(elapsed / 60000);
    if (minutes < 1) return;
    await service
      .grantVoice(guild, member, minutes, config)
      .catch(() => null);
  },
});

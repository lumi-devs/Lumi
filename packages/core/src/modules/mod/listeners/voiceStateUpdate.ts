import { Events } from "discord.js";
import type { Container } from "@lumi/lib/services.js";
import type { VoiceState } from "discord.js";
import { defineListener } from "@lumi/lib/listeners/listener-def.js";

export const VoiceStateUpdateListener = defineListener({
  name: "modVoiceStateUpdate",
  event: Events.VoiceStateUpdate,
  module: "mod",
  guildId: (oldState: VoiceState, newState: VoiceState) =>
    newState.guild?.id ?? oldState.guild?.id ?? null,
  async execute(
    services: Container,
    oldState: VoiceState,
    newState: VoiceState,
  ): Promise<void> {
    if (!newState.channelId || !newState.guild || !newState.member) return;

    const channelChanged = oldState.channelId !== newState.channelId;
    const muteFlagsChanged =
      oldState.mute !== newState.mute ||
      oldState.serverMute !== newState.serverMute;
    if (!channelChanged && !muteFlagsChanged) return;

    const guildId = newState.guild.id;
    const userId = newState.member.id;

    if (!(await services.db.moderation.isVoiceMuted(guildId, userId))) return;

    await newState
      .disconnect("User is currently voice muted.")
      .catch(() => null);
  },
});

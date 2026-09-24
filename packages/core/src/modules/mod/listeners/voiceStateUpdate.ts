import { ApplyOptions } from "@sapphire/decorators";
import { container, Events } from "@sapphire/framework";
import type { VoiceState } from "discord.js";
import { ModuleListener } from "#lib/module-system/ModuleListener.js";

@ApplyOptions<ModuleListener.Options>({
  name: "modVoiceStateUpdate",
  event: Events.VoiceStateUpdate,
  module: "mod",
})
export class VoiceStateUpdateListener extends ModuleListener<
  typeof Events.VoiceStateUpdate
> {
  protected override resolveGuildId(
    oldState: VoiceState,
    newState: VoiceState,
  ): string | null {
    return newState.guild?.id ?? oldState.guild?.id ?? null;
  }

  protected async handle(
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

    if (!(await container.db.moderation.isVoiceMuted(guildId, userId))) return;

    await newState
      .disconnect("User is currently voice muted.")
      .catch(() => null);
  }
}

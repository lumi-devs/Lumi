import { Events } from "discord.js";
import type { ListenerDef } from "@lumi/bot-kit";

/**
 * Server mutes are attached to the voice session. Re-apply an active
 * voice-mute case when the member joins voice, and lift an expired one that
 * the expiry sweep deliberately left active while they were disconnected.
 */
export const voiceMuteStateListener: ListenerDef<Events.VoiceStateUpdate> = {
  name: "mod-voice-mute-state",
  event: Events.VoiceStateUpdate,
  module: "mod",
  async execute(services, _oldState, newState) {
    const member = newState.member;
    if (!member || member.user.bot || !newState.channelId) return;
    if (!(await services.modules.isEnabled(member.guild.id, "mod"))) return;

    const active = await services.db.moderation.listActiveCases(
      member.guild.id,
      member.id,
      "voice_mute",
    );
    if (active.length === 0) return;

    const expired = active.some(
      (modCase) => modCase.expiresAt !== null && modCase.expiresAt.getTime() <= Date.now(),
    );

    if (expired) {
      if (newState.serverMute) {
        await newState
          .setMute(false, "Voice mute case expired")
          .catch((error: unknown) => {
            services.logger.warn(
              { error, guildId: member.guild.id, userId: member.id },
              "failed to lift expired voice mute on rejoin",
            );
          });
      }
      await services.db.moderation.deactivateActiveCases(
        member.guild.id,
        member.id,
        "voice_mute",
      );
      return;
    }

    if (!newState.serverMute) {
      await newState
        .setMute(true, `Voice mute case #${active[0]?.caseNumber ?? "?"} still active`)
        .catch((error: unknown) => {
          services.logger.warn(
            { error, guildId: member.guild.id, userId: member.id },
            "failed to re-apply voice mute on rejoin",
          );
        });
    }
  },
};

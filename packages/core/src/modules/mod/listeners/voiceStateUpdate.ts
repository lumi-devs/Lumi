import { Listener } from "@sapphire/framework";
import type { VoiceState } from "discord.js";
import { container } from "@sapphire/framework";
import { RedisKeys, RedisTTL } from "#database/redis.js";

export class VoiceStateUpdateListener extends Listener {
  public constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, {
      ...options,
      event: "voiceStateUpdate",
    });
  }

  public async run(_oldState: VoiceState, newState: VoiceState): Promise<void> {
    // Only process when user is in a voice channel
    if (!newState.channelId || !newState.guild || !newState.member) return;

    const guildId = newState.guild.id;
    const userId = newState.member.id;

    // Check Redis for active voice mute state
    const key = RedisKeys.voiceMuteState(guildId, userId);
    const isMutedInRedis = await container.redis.get(key);
    let isVoiceMuted = Boolean(isMutedInRedis);

    if (!isVoiceMuted) {
      // Fallback DB check for active voice_mute case
      const activeCases = await container.db.moderation.getActiveCases(guildId, userId, "voice_mute");
      if (activeCases.length > 0) {
        isVoiceMuted = true;
        // Cache back to Redis
        await container.redis.set(key, "1", "EX", RedisTTL.voiceMute);
      }
    }

    if (isVoiceMuted) {
      // Ensure member is server muted and disconnected
      await newState.setMute(true, "Auto-enforcing voice mute").catch(() => null);
      await newState.disconnect("User is currently voice muted.").catch(() => null);
    }
  }
}

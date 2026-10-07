import { container } from "#lib/services.js";
import { type Guild, type GuildMember, type User, Colors } from "discord.js";
import { formatAuditReason } from "#lib/utilities/misc.js";
import { liftAllActiveCases } from "../helpers.js";
import { ValkeyKeys } from "#lib/database/valkey.js";
import { runModerationAction } from "../runModerationAction.js";

export interface VoiceMuteApplyOptions {
  guild: Guild;
  targetMember: GuildMember;
  moderator: User;
  reason: string;
  durationMs: number;
}

export interface VoiceMuteUndoOptions {
  guild: Guild;
  targetMember: GuildMember;
  moderator: User;
  reason: string;
}

export class VoiceMuteAction {
  public static async apply(options: VoiceMuteApplyOptions) {
    const { guild, targetMember, moderator, reason, durationMs } = options;
    const auditReason = formatAuditReason(moderator, reason);

    const expiresAt = new Date(Date.now() + durationMs);

    return runModerationAction({
      perform: async () => {
        // Keeping them out of voice is the whole point, so there is no server
        // mute to apply — only an eviction, and only when they are connected to
        // evict. `voiceStateUpdate` re-evicts them for as long as the case runs.
        if (targetMember.voice.channel) {
          await targetMember.voice.disconnect(auditReason);
        }

        await container.invalidation.invalidate(
          ValkeyKeys.voiceMuteState(guild.id, targetMember.id),
        );

        return container.db.moderation.createModerationCase({
          guildId: guild.id,
          userId: targetMember.id,
          moderatorId: moderator.id,
          action: "voice_mute",
          reason,
          durationSeconds: Math.floor(durationMs / 1000),
          expiresAt,
        });
      },
      scheduleLift: true,
      log: (c) => ({
        guildId: guild.id,
        label: "🎙️ Voice Muted",
        color: Colors.Orange,
        targetId: targetMember.id,
        moderator,
        reason,
        caseNumber: c.caseNumber,
      }),
    });
  }

  public static async undo(options: VoiceMuteUndoOptions) {
    const { guild, targetMember, moderator, reason } = options;
    const key = ValkeyKeys.voiceMuteState(guild.id, targetMember.id);
    await container.invalidation.invalidate(key);
    const auditReason = formatAuditReason(moderator, reason);

    return runModerationAction({
      perform: async () => {
        if (targetMember.voice.channel) {
          await targetMember.voice.setMute(false, auditReason);
        }

        return liftAllActiveCases(
          container,
          guild,
          targetMember.id,
          "voice_mute",
          "unvoice_mute",
          moderator.id,
          reason,
        );
      },
      log: (c) => ({
        guildId: guild.id,
        label: "🎙️ Voice Unmuted",
        color: Colors.Green,
        targetId: targetMember.id,
        moderator,
        reason,
        caseNumber: c.caseNumber,
      }),
    });
  }

  public static async undoRaw(
    guildId: string,
    targetId: string,
    reason: string,
  ): Promise<void> {
    const key = ValkeyKeys.voiceMuteState(guildId, targetId);
    await container.invalidation.invalidate(key);
    await container.discordRest.clearVoiceMute(guildId, targetId, reason);
  }
}

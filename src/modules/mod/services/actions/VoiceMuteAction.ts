import { container } from "#src/lib/Services.js";
import { type Guild, type GuildMember, type User, Colors } from "discord.js";
import { formatAuditReason } from "#src/lib/utilities/AuditReason.js";
import { liftAllActiveCases } from "#src/modules/mod/services/Helpers.js";
import { CacheKeys } from "#src/lib/cache/Keys.js";
import { runModerationAction } from "#src/modules/mod/services/RunModerationAction.js";

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

        if (targetMember.voice.channel) {
          await targetMember.voice.disconnect(auditReason);
        }

        await container.invalidation.invalidate(
          CacheKeys.voiceMuteState(guild.id, targetMember.id),
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
    const key = CacheKeys.voiceMuteState(guild.id, targetMember.id);
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
    const key = CacheKeys.voiceMuteState(guildId, targetId);
    await container.invalidation.invalidate(key);
    await container.discordRest.clearVoiceMute(guildId, targetId, reason);
  }
}

import { container } from "@sapphire/framework";
import { type Guild, type GuildMember, type User, Colors } from "discord.js";
import { Routes } from "discord-api-types/v10";
import { formatAuditReason } from "#lib/utilities/misc.js";
import { liftAllActiveCases } from "../lib/helpers.js";
import { errorCode } from "#lib/utilities/errors.js";
import { RedisKeys } from "#database/redis.js";
import { runModerationAction } from "../lib/runModerationAction.js";

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
        await targetMember.voice.setMute(true, auditReason);
        if (targetMember.voice.channel) {
          await targetMember.voice.disconnect(auditReason);
        }

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
    const key = RedisKeys.voiceMuteState(guild.id, targetMember.id);
    await container.invalidation.invalidate(key);
    const auditReason = formatAuditReason(moderator, reason);

    return runModerationAction({
      perform: async () => {
        await targetMember.voice.setMute(false, auditReason);

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
    const key = RedisKeys.voiceMuteState(guildId, targetId);
    await container.invalidation.invalidate(key);
    await container.client.rest
      .patch(Routes.guildMember(guildId, targetId), {
        body: { mute: false },
        reason,
      })
      .catch((err: unknown) => {
        const code = errorCode(err);
        if (code === 10007 || code === 50013) return;
        throw err;
      });
  }
}

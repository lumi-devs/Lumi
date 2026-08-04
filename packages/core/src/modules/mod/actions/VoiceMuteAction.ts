import { container } from "@sapphire/framework";
import { type Guild, type GuildMember, type User, Colors } from "discord.js";
import { Routes } from "discord-api-types/v10";
import { formatAuditReason } from "#lib/utilities/misc.js";
import { logToChannel, scheduleCaseLift, liftJobId } from "../lib/helpers.js";
import { errorCode } from "#lib/utilities/errors.js";
import { RedisKeys } from "#database/redis.js";
import { cancelTask } from "#lib/schedule-task.js";

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

    await targetMember.voice.setMute(true, auditReason);
    if (targetMember.voice.channel) {
      await targetMember.voice.disconnect(auditReason);
    }

    const expiresAt = new Date(Date.now() + durationMs);

    const c = await container.db.moderation.createModerationCase({
      guildId: guild.id,
      userId: targetMember.id,
      moderatorId: moderator.id,
      action: "voice_mute",
      reason,
      durationSeconds: Math.floor(durationMs / 1000),
      expiresAt,
    });

    await scheduleCaseLift(container, c);

    await logToChannel(
      guild.id,
      "🎙️ Voice Muted",
      Colors.Orange,
      targetMember.id,
      moderator,
      reason,
      c.caseNumber,
    );

    return c;
  }

  public static async undo(options: VoiceMuteUndoOptions) {
    const { guild, targetMember, moderator, reason } = options;
    const key = RedisKeys.voiceMuteState(guild.id, targetMember.id);
    if (container.invalidation) {
      await container.invalidation.invalidate(key);
    } else {
      await container.redis.del(key);
    }
    const auditReason = formatAuditReason(moderator, reason);

    await targetMember.voice.setMute(false, auditReason);

    const activeCases = await container.db.moderation.getActiveCases(
      guild.id,
      targetMember.id,
      "voice_mute",
    );
    for (const active of activeCases) {
      await container.db.moderation.liftModerationCase(active.id);
      await cancelTask(liftJobId(active.id)).catch(() => null);
    }

    const c = await container.db.moderation.createModerationCase({
      guildId: guild.id,
      userId: targetMember.id,
      moderatorId: moderator.id,
      action: "unvoice_mute",
      reason,
    });

    await logToChannel(
      guild.id,
      "🎙️ Voice Unmuted",
      Colors.Green,
      targetMember.id,
      moderator,
      reason,
      c.caseNumber,
    );

    return c;
  }

  public static async undoRaw(
    guildId: string,
    targetId: string,
    reason: string,
  ): Promise<void> {
    const key = RedisKeys.voiceMuteState(guildId, targetId);
    if (container.invalidation) {
      await container.invalidation.invalidate(key);
    } else {
      await container.redis.del(key);
    }
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

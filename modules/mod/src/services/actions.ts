import { Guild, User, GuildMember, Colors, TextChannel } from "discord.js";
import {
  makeCard,
  makeErrorCard,
  makeInfoCard,
  makeWarningCard,
  type CardReply,
} from "@lumi/ui";

export interface ModerationCaseRecord {
  caseNumber: number;
  guildId: string;
  userId: string;
  moderatorId: string;
  action: string;
  reason: string;
  createdAt: Date;
}

export interface ModerationActionOptions {
  guild: Guild;
  targetUser: User;
  targetMember?: GuildMember;
  moderator: User;
  reason: string;
  deleteMessageSeconds?: number;
}

export interface ModerationLogEntry {
  guildId: string;
  label: string;
  color: number;
  targetId: string;
  moderator: User;
  reason: string;
  caseNumber: number;
}

export interface ModActionResult {
  caseRecord: ModerationCaseRecord;
  warnCount?: number;
}

async function sendDm(target: User | GuildMember, card: CardReply): Promise<void> {
  try {
    await target.send(card);
  } catch {}
}

async function createModLog(services: any, entry: ModerationLogEntry): Promise<void> {
  const { guildId, label, color, targetId, moderator, reason, caseNumber } = entry;
  try {
    const guild = services.client.guilds.cache.get(guildId);
    if (!guild) return;

    const config = await services.config.get(guildId, "logging") as any ?? {};
    const channelId = config.modLogChannel;
    if (!channelId) return;

    const channel = guild.channels.cache.get(channelId);
    if (channel && channel.isTextBased()) {
      const card = makeCard(color, label, [
        `**User**\n<@${targetId}> (\`${targetId}\`)`,
        `**Moderator**\n${moderator.tag} (\`${moderator.id}\`)`,
        `**Reason**\n${reason}`,
      ], {
        footer: `Case #${caseNumber}`,
      });
      await (channel as TextChannel).send(card).catch(() => {});
    }
  } catch (e) {
    console.error("[mod] Log dispatch failed:", e);
  }
}

async function createModerationCase(services: any, options: {
  guildId: string;
  userId: string;
  moderatorId: string;
  action: string;
  reason: string;
}): Promise<ModerationCaseRecord> {
  const guild = services.client.guilds.cache.get(options.guildId);
  if (!guild) throw new Error("Guild not found");

  const caseCounter = await services.db.prisma.guildCaseCounter.upsert({
    where: { guildId: options.guildId },
    update: { count: { increment: 1 } },
    create: { guildId: options.guildId, count: 1 },
  });

  const caseRecord = await services.db.prisma.moderationCase.create({
    data: {
      guildId: options.guildId,
      userId: options.userId,
      moderatorId: options.moderatorId,
      action: options.action.toUpperCase(),
      reason: options.reason,
      caseNumber: caseCounter.count,
    },
  });

  return {
    caseNumber: caseRecord.caseNumber,
    guildId: caseRecord.guildId,
    userId: caseRecord.userId,
    moderatorId: caseRecord.moderatorId,
    action: caseRecord.action,
    reason: caseRecord.reason,
    createdAt: caseRecord.createdAt,
  };
}

async function logToChannel(services: any, entry: any): Promise<void> {
  await createModLog(services, entry);
}

async function sendAppealDm(user: User, guild: any, caseRecord: any): Promise<void> {
  try {
    const card = makeInfoCard(
      `📋 Case #${caseRecord.caseNumber} - ${guild.name}`,
      "You can appeal this action at the server's appeal channel.",
    );
    await user.send(card);
  } catch {}
}

async function runModerationAction<T extends { caseNumber: number }>(
  services: any,
  options: {
    perform: () => Promise<{ caseRecord: { caseNumber: number } }>;
    log: (result: any) => any;
    appealDm?: (result: any) => { targetUser: User; guild: any } | null;
  }
): Promise<any> {
  const result = await options.perform();

  const logEntry = options.log(result);
  await logToChannel(services, logEntry);

  if (options.appealDm) {
    const appeal = options.appealDm(result);
    if (appeal) {
      const targetUser = appeal.targetUser;
      const guild = services.client.guilds.cache.get(appeal.guild.id);
      if (guild) {
        const caseRecord = { caseNumber: result.caseRecord.caseNumber };
        await sendAppealDm(targetUser, guild, caseRecord);
      }
    }
  }

  return result;
}

export class BanAction {
  static async apply(services: any, options: {
    guild: any;
    targetUser: User;
    moderator: User;
    reason: string;
    deleteMessageSeconds?: number;
  }): Promise<ModActionResult> {
    const { guild, targetUser, moderator, reason, deleteMessageSeconds = 0 } = options;

    const result = await runModerationAction(services, {
      perform: async () => {
        const dmCard = makeErrorCard(
          `🔨 Banned from ${guild.name}`,
          [
            `**Reason**\n${reason}`,
            `**Appeal**\nContact the server staff if you believe this was a mistake.`,
          ],
        );
        await sendDm(targetUser, dmCard);

        await guild.members.ban(targetUser.id, {
          reason: `${moderator.tag}: ${reason}`,
          deleteMessageSeconds,
        });

        const caseRecord = await createModerationCase(services, {
          guildId: guild.id,
          userId: targetUser.id,
          moderatorId: moderator.id,
          action: "ban",
          reason,
        });

        return { caseRecord };
      },
      log: (result) => ({
        guildId: guild.id,
        label: "🔨 Banned",
        color: Colors.DarkRed,
        targetId: targetUser.id,
        moderator,
        reason,
        caseNumber: result.caseRecord.caseNumber,
      }),
      appealDm: () => ({ targetUser, guild }),
    });

    return result as ModActionResult;
  }

  static async undo(services: any, options: {
    guild: any;
    targetId: string;
    moderator: User;
    reason: string;
  }): Promise<void> {
    const { guild, targetId, moderator, reason } = options;

    await guild.bans.remove(targetId, `${moderator.tag}: ${reason}`);

    await createModerationCase(services, {
      guildId: guild.id,
      userId: targetId,
      moderatorId: moderator.id,
      action: "unban",
      reason,
    });
  }
}

export class KickAction {
  static async apply(services: any, options: {
    guild: any;
    targetMember: any;
    moderator: User;
    reason: string;
  }): Promise<ModActionResult> {
    const { guild, targetMember, moderator, reason } = options;

    const result = await runModerationAction(services, {
      perform: async () => {
        const dmCard = makeWarningCard(
          `👢 Kicked from ${guild.name}`,
          [`**Reason**\n${reason}`],
        );
        await sendDm(targetMember, dmCard);

        await targetMember.kick(`${moderator.tag}: ${reason}`);

        const caseRecord = await createModerationCase(services, {
          guildId: guild.id,
          userId: targetMember.id,
          moderatorId: moderator.id,
          action: "kick",
          reason,
        });

        return { caseRecord };
      },
      log: (result) => ({
        guildId: guild.id,
        label: "👢 Kicked",
        color: Colors.Orange,
        targetId: targetMember.id,
        moderator,
        reason,
        caseNumber: result.caseRecord.caseNumber,
      }),
    });

    return result as ModActionResult;
  }
}

export class TimeoutAction {
  static async apply(services: any, options: {
    targetMember: any;
    moderator: User;
    reason: string;
    duration: number;
  }): Promise<ModActionResult> {
    const { targetMember, moderator, reason, duration } = options;
    const guild = targetMember.guild;

    const result = await runModerationAction(services, {
      perform: async () => {
        const dmCard = makeWarningCard(
          `⏱️ Timed out in ${guild.name}`,
          [
            `**Reason**\n${reason}`,
            `**Duration**\n${Math.floor(duration / 60000)} minutes`,
          ],
        );
        await sendDm(targetMember, dmCard);

        await targetMember.timeout(duration, `${moderator.tag}: ${reason}`);

        const caseRecord = await createModerationCase(services, {
          guildId: guild.id,
          userId: targetMember.id,
          moderatorId: moderator.id,
          action: "timeout",
          reason,
        });

        return { caseRecord };
      },
      log: (result) => ({
        guildId: guild.id,
        label: "⏱️ Timed Out",
        color: Colors.Gold,
        targetId: targetMember.id,
        moderator,
        reason,
        caseNumber: result.caseRecord.caseNumber,
      }),
    });

    return result as ModActionResult;
  }
}

export class WarnAction {
  static async apply(services: any, options: {
    guild: any;
    targetMember: any;
    moderator: User;
    reason: string;
  }): Promise<ModActionResult & { warnCount: number }> {
    const { guild, targetMember, moderator, reason } = options;

    const result = await runModerationAction(services, {
      perform: async () => {
        const dmCard = makeWarningCard(
          `⚠️ Warning in ${guild.name}`,
          [`**Reason**\n${reason}`],
        );
        await sendDm(targetMember, dmCard);

        const caseRecord = await createModerationCase(services, {
          guildId: guild.id,
          userId: targetMember.id,
          moderatorId: moderator.id,
          action: "warn",
          reason,
        });

        return { caseRecord };
      },
      log: (result) => ({
        guildId: guild.id,
        label: "⚠️ Warned",
        color: Colors.Yellow,
        targetId: targetMember.id,
        moderator,
        reason,
        caseNumber: result.caseRecord.caseNumber,
      }),
    });

    const warnCount = await incrementWarnCount(services, guild.id, targetMember.id);
    await checkThresholds(services, guild.id, targetMember.id, warnCount).catch(
      (err: any) => console.error("[Warn] Threshold check failed:", err)
    );

    return { ...result, warnCount } as ModActionResult & { warnCount: number };
  }
}

export class MuteAction {
  static async apply(services: any, options: {
    guild: any;
    targetMember: any;
    moderator: User;
    reason: string;
    duration?: number;
  }): Promise<ModActionResult> {
    return TimeoutAction.apply(services, {
      targetMember: options.targetMember,
      moderator: options.moderator,
      reason: options.reason,
      duration: options.duration ?? 10 * 60000,
    });
  }
}

export class VoiceMuteAction {
  static async apply(services: any, options: {
    guild: any;
    targetMember: any;
    moderator: User;
    reason: string;
    duration?: number;
  }): Promise<ModActionResult> {
    const { guild, targetMember, moderator, reason } = options;

    const result = await runModerationAction(services, {
      perform: async () => {
        await targetMember.voice.setMute(true, `${moderator.tag}: ${reason}`);

        if (options.duration) {
          setTimeout(() => {
            targetMember.voice.setMute(false, `Voice mute expired`).catch(() => {});
          }, options.duration);
        }

        const caseRecord = await createModerationCase(services, {
          guildId: guild.id,
          userId: targetMember.id,
          moderatorId: moderator.id,
          action: "voice_mute",
          reason,
        });

        return { caseRecord };
      },
      log: (result) => ({
        guildId: guild.id,
        label: "🔇 Voice Muted",
        color: Colors.DarkGrey,
        targetId: targetMember.id,
        moderator,
        reason,
        caseNumber: result.caseRecord.caseNumber,
      }),
    });

    return result as ModActionResult;
  }
}

async function incrementWarnCount(services: any, guildId: string, userId: string): Promise<number> {
  const counter = await services.db.prisma.warnCounter.upsert({
    where: { guildId_userId: { guildId, userId } },
    update: { count: { increment: 1 } },
    create: { guildId, userId, count: 1 },
  });
  return counter.count;
}

async function checkThresholds(services: any, guildId: string, userId: string, warnCount: number): Promise<void> {
  const config = await services.config.get(guildId, "mod") as any ?? {};
  const thresholds = config.warnThresholds ?? {};

  for (const [threshold, action] of Object.entries(thresholds)) {
    if (warnCount >= parseInt(threshold)) {
      const { action: actionType, duration } = action as { action: string; duration?: number };
      const member = await services.client.guilds.cache.get(guildId)?.members.fetch(userId).catch(() => null);
      if (!member) return;

      switch (actionType) {
        case "timeout":
          await TimeoutAction.apply(services, {
            targetMember: await services.client.guilds.cache.get(guildId)?.members.fetch(userId),
            moderator: services.client.user,
            reason: `Warn threshold reached (${warnCount} warns)`,
            duration: (duration ?? 10) * 60000,
          });
          break;
        case "ban":
          await BanAction.apply(services, {
            guild: services.client.guilds.cache.get(guildId)!,
            targetUser: await services.client.users.fetch(userId),
            moderator: services.client.user,
            reason: `Warn threshold reached (${warnCount} warns)`,
          });
          break;
      }
    }
  }
}

export { createModerationCase, logToChannel, sendDm, runModerationAction };

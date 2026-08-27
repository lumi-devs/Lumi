import { container } from "@sapphire/framework";
import type { Guild, User } from "discord.js";
import type { ModerationCase } from "@prisma/client";
import { logToChannel, scheduleCaseLift } from "./helpers.js";
import { sendAppealLinkDm } from "#lib/appeals/dm.js";

export interface ModerationLogEntry {
  guildId: string;
  label: string;
  color: number;
  targetId: string;
  moderator: User;
  reason: string;
  caseNumber: number;
  moduleName?: string;
}

export interface ModerationAppealDm {
  targetUser: User;
  guild: Guild;
}

export interface RunModerationActionOptions<T extends ModerationCase> {
  /** DM, Discord API mutation, and the case write itself - the only step that can fail the operation. */
  perform: () => Promise<T>;
  /** Schedules the auto-lift job for time-bound cases (mute, voice mute). Best-effort. */
  scheduleLift?: boolean;
  log: (result: T) => ModerationLogEntry;
  appealDm?: (result: T) => ModerationAppealDm | null;
}

/**
 * Runs the shared moderation-action tail: schedule the lift job, log to the
 * mod-log channel, and DM the appeal link. All three are best-effort - only
 * `perform()` (the case write, and whatever DM/Discord API call precedes it)
 * can fail the operation.
 */
export async function runModerationAction<T extends ModerationCase>(
  options: RunModerationActionOptions<T>,
): Promise<T> {
  const result = await options.perform();

  if (options.scheduleLift) {
    await scheduleCaseLift(container, result);
  }

  const entry = options.log(result);
  await logToChannel(
    entry.guildId,
    entry.label,
    entry.color,
    entry.targetId,
    entry.moderator,
    entry.reason,
    entry.caseNumber,
    entry.moduleName,
  ).catch((err: unknown) =>
    container.logger.warn("[mod] Log channel dispatch failed:", err),
  );

  const appeal = options.appealDm?.(result);
  if (appeal) {
    await sendAppealLinkDm(appeal.targetUser, appeal.guild, result);
  }

  return result;
}

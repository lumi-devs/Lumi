import { container } from "#lib/services.js";
import type { Guild, User } from "discord.js";
import type { ModerationCase } from "@prisma/client";
import { logToChannel } from "#lib/moderation/log.js";
import { scheduleCaseLift } from "./helpers.js";
import { sendAppealLinkDm } from "./appeal-dm.js";

interface ModerationLogEntry {
  guildId: string;
  label: string;
  color: number;
  targetId: string;
  moderator: User;
  reason: string;
  caseNumber: number;
  moduleName?: string;
}

interface ModerationAppealDm {
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
 * All three tail steps are best-effort - only `perform()` can fail the operation.
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
    container,
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

import { container } from "#src/lib/Services.js";
import type { Guild, User } from "discord.js";
import type { ModerationCase } from "@prisma/client";
import { logToChannel } from "#src/lib/discord/ModLog.js";
import { scheduleCaseLift } from "#src/modules/mod/services/Helpers.js";
import { sendAppealLinkDm } from "#src/modules/mod/services/AppealDm.js";

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

interface RunModerationActionOptions<T extends ModerationCase> {

  perform: () => Promise<T>;

  scheduleLift?: boolean;
  log: (result: T) => ModerationLogEntry;
  appealDm?: (result: T) => ModerationAppealDm | null;
}

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

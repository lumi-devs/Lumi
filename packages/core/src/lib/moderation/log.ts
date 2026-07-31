import { tryGetService } from "#lib/module-system/Service.js";
import type { User } from "discord.js";

/** Dispatches a moderation action card to the guild's configured mod-log. */
export async function logToChannel(
  guildId: string,
  action: string,
  color: number,
  targetId: string,
  actor: User,
  reason: string,
  caseNumber: number,
  moduleName = "mod",
): Promise<void> {
  const logService = tryGetService("guild-log");
  await logService?.dispatch({
    guildId,
    moduleName,
    action,
    targetId,
    actorId: actor.id,
    reason,
    color,
    caseNumber,
  });
}

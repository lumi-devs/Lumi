import { tryGetUtility } from "@lumi/lib/module-system/utility.js";
import type { Container } from "@lumi/lib/services.js";
import type { User } from "discord.js";

/** Dispatches a moderation action card to the guild's configured mod-log. */
export async function logToChannel(
  services: Container,
  guildId: string,
  action: string,
  color: number,
  targetId: string,
  actor: User,
  reason: string,
  caseNumber: number,
  moduleName = "mod",
): Promise<void> {
  const logService = tryGetUtility("guild-log");
  await logService?.dispatch(services, {
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

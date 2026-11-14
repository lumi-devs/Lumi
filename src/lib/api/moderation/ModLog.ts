import { tryGetUtility } from "@module-system/Utility.js";
import type { Container } from "@lib/Services.js";
import type { User } from "discord.js";

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
  opts?: { channelId?: string },
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
    ...(opts?.channelId ? { channelId: opts.channelId } : {}),
  });
}

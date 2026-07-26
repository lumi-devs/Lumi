import type { Container } from "@sapphire/framework";
import { tryGetService } from "#lib/module-system/Service.js";
import { type User } from "discord.js";
import { scheduleTask } from "#lib/schedule-task.js";
import { parseDuration, formatDuration } from "#lib/utilities/time.js";

export { parseDuration, formatDuration };

const liftJobId = (caseId: number) => `mod-lift:${caseId}`;

/** Schedule a one-shot lift job to fire exactly when the case expires. Idempotent per case id. */
export async function scheduleCaseLift(
  container: Container,
  c: { id: number; expiresAt: Date | null },
): Promise<void> {
  if (!c.expiresAt) return;
  const delay = Math.max(c.expiresAt.getTime() - Date.now(), 0);
  await scheduleTask(
    "mod-lift",
    { caseId: c.id },
    {
      repeated: false,
      delay,
      customJobOptions: {
        jobId: liftJobId(c.id),
        removeOnComplete: true,
        removeOnFail: true,
      },
    },
  ).catch((err: unknown) =>
    container.logger.error(
      `[mod] Failed to schedule lift for case ${c.id}:`,
      err,
    ),
  );
}

export async function logToChannel(
  guildId: string,
  action: string,
  color: number,
  targetId: string,
  actor: User,
  reason: string,
  caseNumber: number,
): Promise<void> {
  const logService = tryGetService("guild-log");
  await logService?.dispatch({
    guildId,
    moduleName: "mod",
    action,
    targetId,
    actorId: actor.id,
    reason,
    color,
    caseNumber,
  });
}

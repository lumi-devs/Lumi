import type { Container } from "@sapphire/framework";
import { tryGetService } from "#core/module-system/Service.js";
import { type User } from "discord.js";
import { Duration } from "@sapphire/time-utilities";
import { scheduleTask } from "#lib/schedule-task.js";

/** Parse a duration string like "10m", "2h30m", "7d" into milliseconds. Returns null if unparseable. */
export function parseDuration(str: string): number | null {
  const ms = new Duration(str).offset;
  return Number.isNaN(ms) || ms <= 0 ? null : ms;
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

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

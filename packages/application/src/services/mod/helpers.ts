import type { Container } from "#lib/services.js";
import type { Guild } from "discord.js";
import type { CaseAction } from "@prisma/client";
import { scheduleTask, QueuePriority } from "#lib/scheduler/schedule.js";


const liftJobId = (caseId: number) => `mod-lift-${caseId}`;

/** Idempotent per case id. */
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
        priority: QueuePriority.CRITICAL,
      },
    },
  ).catch((err: unknown) =>
    container.logger.error(
      `[mod] Failed to schedule lift for case ${c.id}:`,
      err,
    ),
  );
}

export async function liftAllActiveCases(
  container: Container,
  guild: Guild,
  userId: string,
  action: CaseAction,
  undoAction: CaseAction,
  moderatorId: string,
  reason: string,
) {
  const activeCases = await container.db.moderation.getActiveCases(
    guild.id,
    userId,
    action,
  );
  await container.db.moderation.liftModerationCases(
    activeCases.map((c) => c.id),
  );
  await Promise.all(
    activeCases.map((c) => container.tasks.delete(liftJobId(c.id)).catch(() => null)),
  );

  return container.db.moderation.createModerationCase({
    guildId: guild.id,
    userId,
    moderatorId,
    action: undoAction,
    reason,
  });
}

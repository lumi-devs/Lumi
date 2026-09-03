import type { Container } from "@sapphire/framework";
import type { CommandContext } from "#lib/commands.js";
import type { Guild, GuildMember } from "discord.js";
import { scheduleTask } from "#lib/schedule-task.js";
import { cancelTask } from "#lib/schedule-task.js";

export { logToChannel } from "#lib/moderation/log.js";

export const liftJobId = (caseId: number) => `mod-lift:${caseId}`;

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

/**
 * Lifts all active cases for a user's moderation action and cancels their scheduled tasks.
 * Creates a new unmute/unvoice-mute case record.
 */
export async function liftAllActiveCases(
  container: Container,
  guild: Guild,
  userId: string,
  action: string,
  undoAction: string,
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
    activeCases.map((c) => cancelTask(liftJobId(c.id)).catch(() => null)),
  );

  return container.db.moderation.createModerationCase({
    guildId: guild.id,
    userId,
    moderatorId,
    action: undoAction,
    reason,
  });
}

/**
 * Resolves a voice member from a user, validating guild membership.
 * Sends an error reply to the context if the member is not found.
 */
export async function resolveVoiceMember(
  ctx: CommandContext,
  guild: Guild,
): Promise<GuildMember | null> {
  const user = await ctx.getUser("target");

  if (!user) {
    await ctx.replyError("User Required", "Please specify a target user.");
    return null;
  }

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) {
    await ctx.replyError(
      "Member Not Found",
      "That user is not in this server.",
    );
    return null;
  }

  return member;
}

import type { ModuleServices } from "@lumi/module-kit";
import {
  buildDueWhere,
  isTerminalStatus,
  nextRetry,
  retryDelayMs,
  staleClaimBefore,
} from "./policy.js";

export interface ReminderRecord {
  id: string;
  guildId: string;
  userId: string;
  channelId: string | null;
  message: string;
  remindAt: Date;
  deliveredAt: Date | null;
  status: string;
  recurringCron: string | null;
  createdAt: Date;
}

export type ResolveReminderResult =
  | { kind: "ok"; reminder: ReminderRecord }
  | { kind: "missing" }
  | { kind: "ambiguous" };

export async function listActiveReminders(
  services: ModuleServices,
  guildId: string,
  userId: string,
  limit = 25,
): Promise<ReminderRecord[]> {
  return services.helpers.utility.reminders.listActive(guildId, userId, limit);
}

export async function countActiveReminders(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<number> {
  return services.helpers.utility.reminders.countActive(guildId, userId);
}

export async function resolveUserReminder(
  services: ModuleServices,
  guildId: string,
  userId: string,
  rawId: string,
): Promise<ResolveReminderResult> {
  const id = rawId.trim();
  if (id.length === 0) return { kind: "missing" };

  const exact = await services.helpers.utility.reminders.findExact(
    id,
    guildId,
    userId,
  );
  if (exact) {
    return isTerminalStatus(exact.status)
      ? { kind: "missing" }
      : { kind: "ok", reminder: exact };
  }

  if (id.length < 4) return { kind: "missing" };

  const matches = await services.helpers.utility.reminders.findPrefixMatches(
    guildId,
    userId,
    id,
  );
  if (matches.length === 0) return { kind: "missing" };
  if (matches.length > 1) return { kind: "ambiguous" };
  return { kind: "ok", reminder: matches[0]! };
}

export async function createReminder(
  services: ModuleServices,
  input: {
    guildId: string;
    userId: string;
    channelId: string | null;
    message: string;
    remindAt: Date;
    recurringCron: string | null;
  },
): Promise<ReminderRecord> {
  return services.helpers.utility.reminders.create(input);
}

export async function cancelUserReminder(
  services: ModuleServices,
  reminder: ReminderRecord,
): Promise<boolean> {
  const result = await services.helpers.utility.reminders.cancel(reminder);
  return result.count > 0;
}

export async function clearUserReminders(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<number> {
  const result = await services.helpers.utility.reminders.clear(
    guildId,
    userId,
  );
  return result.count;
}

export async function snoozeUserReminder(
  services: ModuleServices,
  reminder: ReminderRecord,
  remindAt: Date,
): Promise<boolean> {
  const result = await services.helpers.utility.reminders.snooze(
    reminder,
    remindAt,
  );
  return result.count > 0;
}

export async function reclaimStaleClaims(
  services: ModuleServices,
  now: Date,
): Promise<number> {
  const result = await services.helpers.utility.reminders.reclaimStale(
    staleClaimBefore(now),
  );
  return result.count;
}

export async function findDueReminders(
  services: ModuleServices,
  now: Date,
  limit = 100,
): Promise<ReminderRecord[]> {
  return services.helpers.utility.reminders.findDue(buildDueWhere(now), limit);
}

export async function claimReminder(
  services: ModuleServices,
  reminder: ReminderRecord,
): Promise<boolean> {
  const result = await services.helpers.utility.reminders.claim(
    reminder.id,
    reminder.status,
  );
  return result.count === 1;
}

export async function markDelivered(
  services: ModuleServices,
  reminder: ReminderRecord,
  deliveredAt: Date,
  nextRemindAt?: Date | null,
): Promise<void> {
  await services.helpers.utility.reminders.markDelivered(
    reminder.id,
    deliveredAt,
    nextRemindAt,
  );
}

export async function markRetry(
  services: ModuleServices,
  reminder: ReminderRecord,
  now: Date,
): Promise<{ failed: boolean; attempt: number; status: string }> {
  const plan = nextRetry(reminder.status);
  const remindAt = plan.failed
    ? reminder.remindAt
    : new Date(now.getTime() + retryDelayMs(plan.attempt));

  await services.helpers.utility.reminders.markRetry(
    reminder.id,
    plan.failed ? { status: plan.status } : { status: plan.status, remindAt },
  );

  return { failed: plan.failed, attempt: plan.attempt, status: plan.status };
}

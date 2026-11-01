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

type ReminderClient = {
  findMany(args: unknown): Promise<ReminderRecord[]>;
  findFirst(args: unknown): Promise<ReminderRecord | null>;
  create(args: unknown): Promise<ReminderRecord>;
  updateMany(args: unknown): Promise<{ count: number }>;
  deleteMany(args: unknown): Promise<{ count: number }>;
  count(args: unknown): Promise<number>;
};

export type ResolveReminderResult =
  | { kind: "ok"; reminder: ReminderRecord }
  | { kind: "missing" }
  | { kind: "ambiguous" };

export function reminderModel(services: ModuleServices): ReminderClient {
  return services.db.prisma.reminder as ReminderClient;
}

export async function listActiveReminders(
  services: ModuleServices,
  guildId: string,
  userId: string,
  limit = 25,
): Promise<ReminderRecord[]> {
  return reminderModel(services).findMany({
    where: {
      guildId,
      userId,
      status: { notIn: ["delivered", "cancelled", "failed"] },
    },
    orderBy: { remindAt: "asc" },
    take: limit,
  });
}

export async function countActiveReminders(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<number> {
  return reminderModel(services).count({
    where: {
      guildId,
      userId,
      status: { notIn: ["delivered", "cancelled", "failed"] },
    },
  });
}

export async function resolveUserReminder(
  services: ModuleServices,
  guildId: string,
  userId: string,
  rawId: string,
): Promise<ResolveReminderResult> {
  const model = reminderModel(services);
  const id = rawId.trim();
  if (id.length === 0) return { kind: "missing" };

  const exact = await model.findFirst({
    where: { id, guildId, userId },
  });
  if (exact) {
    return isTerminalStatus(exact.status)
      ? { kind: "missing" }
      : { kind: "ok", reminder: exact };
  }

  if (id.length < 4) return { kind: "missing" };

  const matches = await model.findMany({
    where: {
      guildId,
      userId,
      id: { startsWith: id },
      status: { notIn: ["delivered", "cancelled", "failed"] },
    },
    orderBy: { remindAt: "asc" },
    take: 2,
  });
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
  return reminderModel(services).create({
    data: {
      guildId: input.guildId,
      userId: input.userId,
      channelId: input.channelId,
      message: input.message,
      remindAt: input.remindAt,
      recurringCron: input.recurringCron,
      status: "pending",
    },
  });
}

export async function cancelUserReminder(
  services: ModuleServices,
  reminder: ReminderRecord,
): Promise<boolean> {
  const result = await reminderModel(services).updateMany({
    where: {
      id: reminder.id,
      guildId: reminder.guildId,
      userId: reminder.userId,
      status: { notIn: ["delivered", "cancelled", "failed"] },
    },
    data: { status: "cancelled" },
  });
  return result.count > 0;
}

export async function clearUserReminders(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<number> {
  const result = await reminderModel(services).updateMany({
    where: {
      guildId,
      userId,
      status: { notIn: ["delivered", "cancelled", "failed"] },
    },
    data: { status: "cancelled" },
  });
  return result.count;
}

export async function snoozeUserReminder(
  services: ModuleServices,
  reminder: ReminderRecord,
  remindAt: Date,
): Promise<boolean> {
  const result = await reminderModel(services).updateMany({
    where: {
      id: reminder.id,
      guildId: reminder.guildId,
      userId: reminder.userId,
      status: { notIn: ["delivered", "cancelled", "failed"] },
    },
    data: { remindAt, status: "pending" },
  });
  return result.count > 0;
}

export async function reclaimStaleClaims(
  services: ModuleServices,
  now: Date,
): Promise<number> {
  const result = await reminderModel(services).updateMany({
    where: {
      status: "processing",
      remindAt: { lte: staleClaimBefore(now) },
    },
    data: { status: "pending" },
  });
  return result.count;
}

export async function findDueReminders(
  services: ModuleServices,
  now: Date,
  limit = 100,
): Promise<ReminderRecord[]> {
  return reminderModel(services).findMany({
    where: buildDueWhere(now),
    orderBy: { remindAt: "asc" },
    take: limit,
  });
}

export async function claimReminder(
  services: ModuleServices,
  reminder: ReminderRecord,
): Promise<boolean> {
  const result = await reminderModel(services).updateMany({
    where: { id: reminder.id, status: reminder.status },
    data: { status: "processing" },
  });
  return result.count === 1;
}

export async function markDelivered(
  services: ModuleServices,
  reminder: ReminderRecord,
  deliveredAt: Date,
  nextRemindAt?: Date | null,
): Promise<void> {
  const recurring = nextRemindAt !== null && nextRemindAt !== undefined;
  await reminderModel(services).updateMany({
    where: { id: reminder.id, status: "processing" },
    data: {
      status: recurring ? "pending" : "delivered",
      deliveredAt,
      ...(recurring ? { remindAt: nextRemindAt } : {}),
    },
  });
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

  await reminderModel(services).updateMany({
    where: { id: reminder.id, status: "processing" },
    data: plan.failed
      ? { status: plan.status }
      : { status: plan.status, remindAt },
  });

  return { failed: plan.failed, attempt: plan.attempt, status: plan.status };
}

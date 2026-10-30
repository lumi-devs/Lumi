export const TerminalStatuses = ["delivered", "cancelled", "failed"] as const;

export const MaxDeliveryAttempts = 3;
export const RetryBaseDelayMs = 5 * 60 * 1_000;
export const MaxRetryDelayMs = 60 * 60 * 1_000;
export const StaleClaimMs = 15 * 60 * 1_000;

export interface ReminderTiming {
  readonly id: string;
  readonly status: string;
  readonly remindAt: Date;
}

export interface DueWhere {
  readonly remindAt: { readonly lte: Date };
  readonly OR: ReadonlyArray<
    | { readonly status: string }
    | { readonly status: { readonly startsWith: string } }
  >;
}

export interface RetentionWhere {
  readonly guildId?: string;
  readonly OR: ReadonlyArray<Record<string, unknown>>;
}

export function isTerminalStatus(status: string): boolean {
  return (TerminalStatuses as readonly string[]).includes(status);
}

export function isActiveStatus(status: string): boolean {
  return (
    status === "pending" ||
    status === "processing" ||
    status.startsWith("retry:")
  );
}

export function isDue(reminder: ReminderTiming, now: Date): boolean {
  return (
    reminder.status !== "processing" &&
    isActiveStatus(reminder.status) &&
    reminder.remindAt.getTime() <= now.getTime()
  );
}

export function selectDueReminders<T extends ReminderTiming>(
  reminders: readonly T[],
  now: Date,
  limit = 100,
): T[] {
  return reminders
    .filter((reminder) => isDue(reminder, now))
    .sort((left, right) => left.remindAt.getTime() - right.remindAt.getTime())
    .slice(0, Math.max(0, limit));
}

export function buildDueWhere(now: Date): DueWhere {
  return {
    remindAt: { lte: now },
    OR: [{ status: "pending" }, { status: { startsWith: "retry:" } }],
  };
}

export function staleClaimBefore(now: Date): Date {
  return new Date(now.getTime() - StaleClaimMs);
}

export function retryCount(status: string): number {
  const match = /^retry:(\d+)$/.exec(status);
  if (!match) return 0;
  const count = Number(match[1]);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

export function nextRetry(
  status: string,
  maxAttempts = MaxDeliveryAttempts,
): { status: string; attempt: number; failed: boolean } {
  const attempt = retryCount(status) + 1;
  if (attempt >= maxAttempts) {
    return { status: "failed", attempt, failed: true };
  }
  return { status: `retry:${attempt}`, attempt, failed: false };
}

export function retryDelayMs(attempt: number): number {
  const exponent = Math.max(0, attempt - 1);
  return Math.min(RetryBaseDelayMs * 2 ** exponent, MaxRetryDelayMs);
}

export function canCreateReminder(
  activeCount: number,
  maxPerUser: number,
): boolean {
  return activeCount < maxPerUser;
}

export function retentionCutoff(now: Date, retentionDays: number): Date {
  const days = Math.max(1, Math.floor(retentionDays));
  return new Date(now.getTime() - days * 86_400_000);
}

export function buildRetentionWhere(
  now: Date,
  retentionDays: number,
  guildId?: string,
): RetentionWhere {
  const cutoff = retentionCutoff(now, retentionDays);
  return {
    ...(guildId === undefined ? {} : { guildId }),
    OR: [
      { status: "delivered", deliveredAt: { lte: cutoff } },
      {
        status: { in: ["cancelled", "failed"] },
        createdAt: { lte: cutoff },
      },
    ],
  };
}

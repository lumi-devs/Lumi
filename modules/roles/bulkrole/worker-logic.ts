export type BulkRoleJobStatus =
  "pending" | "running" | "paused" | "completed" | "cancelled" | "failed";

export interface BulkJobProgress {
  readonly status: BulkRoleJobStatus;
  readonly total: number;
  readonly processed: number;
  readonly failed: number;
}

export function isBulkJobStatus(value: unknown): value is BulkRoleJobStatus {
  return (
    value === "pending" ||
    value === "running" ||
    value === "paused" ||
    value === "completed" ||
    value === "cancelled" ||
    value === "failed"
  );
}

export function isRunnableJob(status: BulkRoleJobStatus): boolean {
  return status === "pending" || status === "running";
}

export function isTerminalJob(status: BulkRoleJobStatus): boolean {
  return (
    status === "completed" || status === "cancelled" || status === "failed"
  );
}

export function resumeJobStatus(status: BulkRoleJobStatus): BulkRoleJobStatus {
  return status === "paused" ? "pending" : status;
}

export function cancelJobStatus(status: BulkRoleJobStatus): BulkRoleJobStatus {
  return isTerminalJob(status) ? status : "cancelled";
}

export interface AfterBatchInput {
  readonly status: BulkRoleJobStatus;
  readonly remaining: number;
  readonly failed: number;
  readonly total: number;
}

export function nextJobStatus(input: AfterBatchInput): BulkRoleJobStatus {
  if (input.status === "cancelled") return "cancelled";
  if (input.remaining > 0) return "pending";
  if (input.total > 0 && input.failed >= input.total) return "failed";
  return "completed";
}

export function applyProgress(
  job: BulkJobProgress,
  succeeded: number,
  failed: number,
): BulkJobProgress {
  const processed = Math.min(job.total, job.processed + succeeded);
  return {
    status: job.status,
    total: job.total,
    processed,
    failed: job.failed + failed,
  };
}

export function progressPercent(job: BulkJobProgress): number {
  if (job.total <= 0) return 100;
  return Math.min(100, Math.round((job.processed / job.total) * 100));
}

export function progressBar(job: BulkJobProgress, width = 12): string {
  const filled = Math.round((progressPercent(job) / 100) * width);
  return `${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}`;
}

export function nextBatch<T>(
  items: readonly T[],
  batchSize: number,
): { batch: T[]; remaining: number } {
  const size = Math.max(1, Math.floor(batchSize));
  return {
    batch: items.slice(0, size),
    remaining: Math.max(0, items.length - size),
  };
}

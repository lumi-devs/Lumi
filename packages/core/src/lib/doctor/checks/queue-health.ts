import { Queue } from "bullmq";
import {
  getScheduledTasksConnectionOptions,
  SCHEDULED_TASKS_QUEUE_NAME,
} from "#lib/client/scheduled-tasks-queue.js";
import { runCheck } from "#lib/doctor/util.js";
import type { DoctorCheckResult } from "#lib/doctor/types.js";

export const QueueHealthCheckName = "queue-health";

/** No documented threshold exists for "too many failed jobs" - this is a diagnostic default, not a hard limit. */
const DefaultFailedWarnThreshold = 50;

export interface QueueJobCounts {
  failed: number;
  waiting: number;
  delayed: number;
}

export interface QueueHealthCheckDeps {
  /**
   * Override for tests; defaults to opening a BullMQ `Queue` against the
   * same name/connection every scheduled-tasks producer in the fleet uses
   * (`#lib/client/scheduled-tasks-queue.js`), reading its job counts, and
   * closing it again.
   */
  getJobCounts?: () => Promise<QueueJobCounts>;
  failedWarnThreshold?: number;
}

async function defaultGetJobCounts(): Promise<QueueJobCounts> {
  const queue = new Queue(SCHEDULED_TASKS_QUEUE_NAME, {
    connection: getScheduledTasksConnectionOptions(),
  });
  try {
    const counts = await queue.getJobCounts("failed", "waiting", "delayed");
    return {
      failed: counts.failed ?? 0,
      waiting: counts.waiting ?? 0,
      delayed: counts.delayed ?? 0,
    };
  } finally {
    await queue.close();
  }
}

export async function checkQueueHealth(
  deps: QueueHealthCheckDeps = {},
  timeoutMs = 5_000,
): Promise<DoctorCheckResult> {
  return runCheck(QueueHealthCheckName, timeoutMs, async () => {
    const failedWarnThreshold = deps.failedWarnThreshold ?? DefaultFailedWarnThreshold;

    let counts: QueueJobCounts;
    try {
      counts = await (deps.getJobCounts ?? defaultGetJobCounts)();
    } catch (err) {
      return {
        name: QueueHealthCheckName,
        status: "fail",
        detail: `Could not read "${SCHEDULED_TASKS_QUEUE_NAME}" queue counts: ${err instanceof Error ? err.message : String(err)}`,
        hint: "Check Redis is reachable and REDIS_TASK_DB matches the scheduler's.",
      };
    }

    const detail = `waiting=${counts.waiting}, delayed=${counts.delayed}, failed=${counts.failed}`;
    if (counts.failed > failedWarnThreshold) {
      return {
        name: QueueHealthCheckName,
        status: "warn",
        detail: `"${SCHEDULED_TASKS_QUEUE_NAME}" has a high failed-job count (${detail}).`,
        hint: `More than ${failedWarnThreshold} failed jobs - inspect apps/scheduler logs for a recurring failure.`,
      };
    }
    return {
      name: QueueHealthCheckName,
      status: "ok",
      detail: `"${SCHEDULED_TASKS_QUEUE_NAME}": ${detail}.`,
    };
  });
}

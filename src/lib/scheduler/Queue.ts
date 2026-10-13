import { parseValkeyConnectionOption } from "#src/lib/valkey/Store.js";
import { envParseInteger } from "#src/lib/Env.js";
import { QueuePriority } from "#src/lib/scheduler/Schedule.js";
import type { ConnectionOptions, JobsOptions } from "bullmq";

export type QueueConnectionOptions = ConnectionOptions;
export type QueueJobOptions = JobsOptions;

export interface QueueLogger {
  debug?(message: string, ...args: unknown[]): void;
  info?(message: string, ...args: unknown[]): void;
  warn?(message: string, ...args: unknown[]): void;
  error?(message: string, ...args: unknown[]): void;
}

export type JobStatus =
  | "completed"
  | "failed"
  | "delayed"
  | "active"
  | "waiting"
  | "waiting-children"
  | "prioritized"
  | "paused";

export interface FailedJobInfo {
  jobId: string;
  name: string;
  attemptsMade: number;
  maxAttempts: number;
  failedReason?: string;
  error?: Error;
}

export interface IJobQueue<T = unknown> {
  readonly name: string;
  add(name: string, payload: T, options?: QueueJobOptions): Promise<unknown>;
  getJob(id: string): Promise<{ id?: string; name: string; data: T; remove(): Promise<void> } | null | undefined>;
  delete(id: string): Promise<boolean>;
  getJobCounts(...types: JobStatus[]): Promise<Record<string, number>>;
  clean(graceMs: number, limit?: number, type?: string): Promise<string[]>;
  drain(delayed?: boolean): Promise<void>;
  close(): Promise<void>;
}

export const SCHEDULED_TASKS_QUEUE_NAME = "scheduled-tasks";

export function getQueuePrefix(): string {
  return `lumi:${process.env["NODE_ENV"] ?? "development"}:`;
}

export function getScheduledTasksConnectionOptions(): ConnectionOptions {
  return {
    ...parseValkeyConnectionOption(),
    db: process.env["VALKEY_CLUSTER_NODES"] ? 0 : envParseInteger("VALKEY_TASK_DB", 1),
    enableOfflineQueue: false,
  };
}

export const SCHEDULED_TASKS_DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: 100,
  removeOnFail: 1_000,
  priority: QueuePriority.UTILITY,
} as const;

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

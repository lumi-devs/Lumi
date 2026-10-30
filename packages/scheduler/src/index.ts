import { DistributedLock } from "@lumi/redis";
import type { Redis } from "ioredis";

export interface ScheduledJob {
  readonly name: string;
  readonly cron: string;
  readonly handler: () => Promise<void>;
  readonly timezone?: string;

  readonly lockTtlMs?: number;
}








export class DistributedScheduler {
  private readonly redis: Redis;
  private readonly jobs = new Map<string, ScheduledJob>();
  private readonly intervals = new Map<string, NodeJS.Timeout>();
  private readonly running = new Set<string>();
  private started = false;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  register(job: ScheduledJob): void {
    if (this.started) {
      this.unregister(job.name);
    }
    this.jobs.set(job.name, job);
    if (this.started) this.scheduleJob(job);
  }

  unregister(name: string): void {
    this.jobs.delete(name);
    const interval = this.intervals.get(name);
    if (interval) clearInterval(interval);
    this.intervals.delete(name);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    for (const job of this.jobs.values()) this.scheduleJob(job);
  }

  async stop(): Promise<void> {
    this.started = false;
    for (const interval of this.intervals.values()) clearInterval(interval);
    this.intervals.clear();
  }

  private scheduleJob(job: ScheduledJob): void {
    const run = (): void => {
      void this.runJob(job);
    };
    this.intervals.set(job.name, setInterval(run, this.parseCronToMs(job.cron)));
    run();
  }

  private async runJob(job: ScheduledJob): Promise<void> {


    if (!this.started || !this.jobs.has(job.name) || this.running.has(job.name)) {
      return;
    }
    this.running.add(job.name);
    try {
      const lock = new DistributedLock(this.redis, `scheduler:${job.name}`, {
        ttlMs: job.lockTtlMs ?? 60_000,
      });
      const acquired = await lock.acquire();
      if (!acquired) return;
      try {

        if (!this.started || !this.jobs.has(job.name)) return;
        await job.handler();
      } finally {
        await lock.release();
      }
    } catch (error) {
      console.error(`Job ${job.name} failed:`, error);
    } finally {
      this.running.delete(job.name);
    }
  }

  private parseCronToMs(cron: string): number {
    const [minuteField] = cron.trim().split(/\s+/);
    if (minuteField?.startsWith("*/")) {
      const minutes = Number(minuteField.slice(2));

      if (Number.isInteger(minutes) && minutes > 0) return minutes * 60_000;
    }
    return 60_000;
  }
}

export function createScheduler(redis: Redis): DistributedScheduler {
  return new DistributedScheduler(redis);
}

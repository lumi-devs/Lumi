import { DistributedLock, } from "@lumi/redis";
import type { Redis } from "ioredis";

export interface ScheduledJob {
  name: string;
  cron: string;
  handler: () => Promise<void>;
  timezone?: string;
}

export class DistributedScheduler {
  private readonly redis: Redis;
  private readonly jobs = new Map<string, ScheduledJob>();
  private intervals = new Map<string, NodeJS.Timeout>();
  private running = false;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  register(job: ScheduledJob): void {
    this.jobs.set(job.name, job);
  }

  unregister(name: string): void {
    this.jobs.delete(name);
    const interval = this.intervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(name);
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    for (const job of this.jobs.values()) {
      this.scheduleJob(job);
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }

  private scheduleJob(job: ScheduledJob): void {
    // Simple interval-based scheduling for now
    // In production, use a proper cron parser with timezone support
    const runJob = async () => {
      const lock = new DistributedLock(this.redis, `scheduler:${job.name}`, { ttlMs: 60_000 });
      const acquired = await lock.acquire();
      if (!acquired) return;

      try {
        await job.handler();
      } catch (error) {
        console.error(`Job ${job.name} failed:`, error);
      } finally {
        await lock.release();
      }
    };

    // Parse cron to get interval (simplified)
    const intervalMs = this.parseCronToMs(job.cron);
    const interval = setInterval(runJob, intervalMs);
    this.intervals.set(job.name, interval);
    
    // Run once immediately
    runJob();
  }

  private parseCronToMs(cron: string): number {
    // Very basic parsing - in production use cron-parser
    // Format: "*/5 * * * *" = every 5 minutes
    const parts = cron.split(" ");
    if (parts[0].startsWith("*/")) {
      const minutes = parseInt(parts[0].slice(2), 10);
      return minutes * 60 * 1000;
    }
    return 60_000; // Default 1 minute
  }
}

export function createScheduler(redis: Redis): DistributedScheduler {
  return new DistributedScheduler(redis);
}
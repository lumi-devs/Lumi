import { logger } from "@lumi/foundation";
import { matchesCron, parseCron } from "@lumi/cron";
import { DistributedLock, type Redis } from "@lumi/redis";

export interface ScheduledJob {
  readonly name: string;
  readonly cron: string;
  readonly handler: () => Promise<void>;
  readonly timezone?: string;

  readonly lockTtlMs?: number;
}

const TickMs = 60_000;

function minuteKey(date: Date): number {
  return Math.floor(date.getTime() / TickMs);
}

export class DistributedScheduler {
  private readonly redis: Redis;
  private readonly jobs = new Map<string, ScheduledJob>();
  private readonly lastRunMinute = new Map<string, number>();
  private readonly running = new Set<string>();
  private tickTimer: NodeJS.Timeout | null = null;
  private alignTimer: NodeJS.Timeout | null = null;
  private started = false;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  register(job: ScheduledJob): void {
    try {
      parseCron(job.cron);
    } catch (error) {
      logger.error(`Scheduler job "${job.name}" has an invalid cron expression`, {
        cron: job.cron,
        error,
      });
      return;
    }

    this.jobs.set(job.name, job);
  }

  unregister(name: string): void {
    this.jobs.delete(name);
    this.lastRunMinute.delete(name);
    this.running.delete(name);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const now = Date.now();
    const delay = TickMs - (now % TickMs);
    this.alignTimer = setTimeout(() => {
      this.alignTimer = null;
      if (!this.started) return;
      void this.tick();
      this.tickTimer = setInterval(() => void this.tick(), TickMs);
    }, delay);
  }

  async stop(): Promise<void> {
    this.started = false;
    if (this.alignTimer) clearTimeout(this.alignTimer);
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.alignTimer = null;
    this.tickTimer = null;
    this.lastRunMinute.clear();
  }

  private async tick(): Promise<void> {
    if (!this.started) return;
    const now = new Date();
    const key = minuteKey(now);

    const due: ScheduledJob[] = [];
    for (const job of this.jobs.values()) {
      if (this.lastRunMinute.get(job.name) === key) continue;
      if (!matches(job, now)) continue;
      due.push(job);
    }

    for (const job of due) this.lastRunMinute.set(job.name, key);

    await Promise.all(due.map((job) => this.runJob(job)));
  }

  private async runJob(job: ScheduledJob): Promise<void> {
    if (!this.started || !this.jobs.has(job.name)) return;
    if (this.running.has(job.name)) return;

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
      logger.error(`Job ${job.name} failed:`, error);
    } finally {
      this.running.delete(job.name);
    }
  }
}

function matches(job: ScheduledJob, at: Date): boolean {
  try {
    return matchesCron(job.cron, at, job.timezone);
  } catch (error) {
    logger.error(`Job ${job.name} cron evaluation failed`, {
      cron: job.cron,
      error,
    });
    return false;
  }
}

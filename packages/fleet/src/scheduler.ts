import type { Redis } from "ioredis";
import { EventEmitter } from "events";

export interface ScheduledJob {
  id: string;
  name: string;
  cron: string;
  timezone?: string;
  payload: any;
  runOn: "leader" | "all" | "single";
  enabled: boolean;
  nextRun?: Date;
  lastRun?: Date;
  runCount: number;
}

export interface LeaderElectionOptions {
  lockKey: string;
  ttlMs: number;
  renewIntervalMs: number;
  onElected: () => Promise<void>;
  onRevoked: () => Promise<void>;
}

export class DistributedScheduler extends EventEmitter {
  private readonly redis: Redis;
  private readonly jobs: Map<string, ScheduledJob> = new Map();
  private readonly intervals: Map<string, NodeJS.Timeout> = new Map();
  private leaderElection?: LeaderElection;
  private _isLeader = false;

  constructor(redis: Redis) {
    super();
    this.redis = redis;
  }

  async startLeaderElection(options: LeaderElectionOptions): Promise<void> {
    this.leaderElection = new LeaderElection(this.redis, options);
    this.leaderElection.on("elected", () => {
      this._isLeader = true;
      this.emit("leader_elected");
      this.startLeaderJobs();
    });
    this.leaderElection.on("revoked", () => {
      this._isLeader = false;
      this.emit("leader_revoked");
      this.stopLeaderJobs();
    });
    await this.leaderElection.start();
  }

  private startLeaderJobs(): void {
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.enabled && job.runOn === "leader") {
        this.scheduleJob(job);
      }
    }
  }

  private stopLeaderJobs(): void {
    for (const [jobId, interval] of this.intervals.entries()) {
      const job = this.jobs.get(jobId);
      if (job?.runOn === "leader") {
        clearInterval(interval);
        this.intervals.delete(jobId);
      }
    }
  }

  addJob(job: Omit<ScheduledJob, "runCount" | "lastRun" | "nextRun">): void {
    const fullJob: ScheduledJob = {
      ...job,
      runCount: 0,
    };
    this.jobs.set(job.id, fullJob);

    if (job.enabled) {
      if (job.runOn === "all" || (job.runOn === "leader" && this._isLeader)) {
        this.scheduleJob(fullJob);
      } else if (job.runOn === "single") {
        // Only schedule on one worker - use Redis lock
        this.scheduleSingleJob(fullJob);
      }
    }
  }

  removeJob(jobId: string): void {
    const interval = this.intervals.get(jobId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(jobId);
    }
    this.jobs.delete(jobId);
  }

  private scheduleJob(job: ScheduledJob): void {
    const interval = this.parseCronToMs(job.cron);
    if (!interval) {
      console.error(`[Scheduler] Invalid cron for job ${job.id}: ${job.cron}`);
      return;
    }

    const run = async () => {
      try {
        job.lastRun = new Date();
        job.runCount++;
        this.emit("job_run", job);
        // Job execution is handled by the consumer via event
      } catch (error) {
        this.emit("job_error", job, error);
      }
    };

    // Calculate delay until next run
    const now = Date.now();
    const nextRun = this.calculateNextRun(job.cron, job.timezone);
    job.nextRun = nextRun;
    const delay = Math.max(0, nextRun.getTime() - now);

    const timeout = setTimeout(() => {
      run();
      const intervalId = setInterval(run, interval);
      this.intervals.set(job.id, intervalId);
    }, delay);

    this.intervals.set(job.id, timeout);
  }

  private scheduleSingleJob(job: ScheduledJob): void {
    // Use Redis distributed lock to ensure only one worker runs this job
    const lockKey = `lumi:scheduler:lock:${job.id}`;
    const interval = this.parseCronToMs(job.cron);
    if (!interval) return;

    const run = async () => {
      const lock = await this.redis.set(lockKey, this.getWorkerId(), "PX", interval, "NX");
      if (lock === "OK") {
        try {
          job.lastRun = new Date();
          job.runCount++;
          this.emit("job_run", job);
        } finally {
          await this.redis.del(lockKey);
        }
      }
    };

    const now = Date.now();
    const nextRun = this.calculateNextRun(job.cron, job.timezone);
    job.nextRun = nextRun;
    const delay = Math.max(0, nextRun.getTime() - now);

    const timeout = setTimeout(() => {
      run();
      const intervalId = setInterval(run, interval);
      this.intervals.set(job.id, intervalId);
    }, delay);

    this.intervals.set(job.id, timeout);
  }

  private parseCronToMs(cron: string): number | null {
    // Simple cron parser for common patterns
    // Supports: * * * * * (every minute), */5 * * * * (every 5 min), 0 * * * * (hourly), 0 0 * * * (daily)
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return null;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    // Every minute
    if (cron === "* * * * *") return 60000;

    // Every N minutes
    if (minute.startsWith("*/") && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      const mins = parseInt(minute.slice(2));
      if (!isNaN(mins)) return mins * 60000;
    }

    // Hourly at minute 0
    if (minute === "0" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      return 3600000;
    }

    // Daily at 00:00
    if (minute === "0" && hour === "0" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      return 86400000;
    }

    return null; // Complex cron not supported in simple parser
  }

  private calculateNextRun(cron: string, timezone?: string): Date {
    // Simplified - just return next interval
    const interval = this.parseCronToMs(cron) || 60000;
    return new Date(Date.now() + interval);
  }

  private getWorkerId(): string {
    return process.env.WORKER_ID ?? `worker-${process.pid}`;
  }

  getJobs(): ScheduledJob[] {
    return Array.from(this.jobs.values());
  }

  getJob(jobId: string): ScheduledJob | undefined {
    return this.jobs.get(jobId);
  }

  isLeader(): boolean {
    return this._isLeader;
  }

  async shutdown(): Promise<void> {
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    this.intervals.clear();
    if (this.leaderElection) {
      await this.leaderElection.stop();
    }
  }
}

class LeaderElection extends EventEmitter {
  private readonly redis: Redis;
  private readonly options: LeaderElectionOptions;
  private renewalInterval?: NodeJS.Timeout;
  private isRunning = false;

  constructor(redis: Redis, options: LeaderElectionOptions) {
    super();
    this.redis = redis;
    this.options = options;
  }

  async start(): Promise<void> {
    this.isRunning = true;
    await this.attemptElection();
  }

  private async attemptElection(): Promise<void> {
    const lockKey = this.options.lockKey;
    const ttlMs = this.options.ttlMs;
    const workerId = process.env.WORKER_ID ?? `worker-${process.pid}`;

    const acquired = await this.redis.set(lockKey, workerId, "PX", ttlMs, "NX");
    if (acquired === "OK") {
      this.emit("elected");
      await this.options.onElected();
      this.startRenewal();
    } else {
      // Check if we're already the leader
      const current = await this.redis.get(lockKey);
      if (current === workerId) {
        this.emit("elected");
        await this.options.onElected();
        this.startRenewal();
      } else {
        // Try again after a random delay
        const delay = 1000 + Math.random() * 5000;
        setTimeout(() => this.attemptElection(), delay);
      }
    }
  }

  private startRenewal(): void {
    this.renewalInterval = setInterval(async () => {
      if (!this.isRunning) return;

      const lockKey = this.options.lockKey;
      const ttlMs = this.options.ttlMs;
      const workerId = process.env.WORKER_ID ?? `worker-${process.pid}`;

      // Use Lua script for atomic check-and-renew
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("pexpire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;
      const result = await this.redis.eval(script, 1, lockKey, workerId, ttlMs.toString());
      
      if (result === 0) {
        // Lost leadership
        this.stopRenewal();
        this.emit("revoked");
        await this.options.onRevoked();
        // Try to re-elect
        setTimeout(() => this.attemptElection(), 1000);
      }
    }, this.options.renewIntervalMs);
  }

  private stopRenewal(): void {
    if (this.renewalInterval) {
      clearInterval(this.renewalInterval);
      this.renewalInterval = undefined;
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.stopRenewal();
    
    const lockKey = this.options.lockKey;
    const workerId = process.env.WORKER_ID ?? `worker-${process.pid}`;
    
    // Release lock if we own it
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await this.redis.eval(script, 1, lockKey, workerId);
  }
}

export function createDistributedScheduler(redis: Redis): DistributedScheduler {
  return new DistributedScheduler(redis);
}
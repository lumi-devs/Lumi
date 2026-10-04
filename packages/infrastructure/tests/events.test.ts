import { describe, it, expect, vi } from "bun:test";
import { QueueEventsWatcher, watchFailedJobs } from "../src/queues/events.js";

// Mock QueueEvents
let lastEventHandler: ((arg: any) => void) | null = null;

vi.mock("bullmq", () => {
  class MockQueueEvents {
    public name: string;
    public options: any;
    public listeners: Record<string, ((...args: any[]) => void)[]> = {};

    public constructor(name: string, options: any) {
      this.name = name;
      this.options = options;
    }

    public on(event: string, fn: (...args: any[]) => void) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(fn);
      if (event === "failed") lastEventHandler = fn as any;
      return this;
    }

    public removeListener(event: string, fn: (...args: any[]) => void) {
      if (this.listeners[event]) {
        this.listeners[event] = this.listeners[event].filter((f) => f !== fn);
      }
      return this;
    }

    public close = vi.fn().mockResolvedValue(undefined);
  }

  return {
    QueueEvents: MockQueueEvents,
  };
});

describe("QueueEventsWatcher & watchFailedJobs", () => {
  it("triggers onExhausted only when attemptsMade >= maxAttempts", async () => {
    const watcher = new QueueEventsWatcher("test-queue");
    const onExhausted = vi.fn();

    const getJobFn = vi.fn().mockResolvedValue({
      name: "daily-backup",
      attemptsMade: 5,
      opts: { attempts: 5 },
      failedReason: "Disk full",
    });

    const unwatch = watcher.watchExhaustedRetries(getJobFn, onExhausted);

    expect(lastEventHandler).toBeDefined();
    await lastEventHandler!({ jobId: "job-failed-1", failedReason: "Disk full" });

    // Allow promise tick inside watcher
    await new Promise((r) => setTimeout(r, 10));

    expect(onExhausted).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-failed-1",
        name: "daily-backup",
        attemptsMade: 5,
        maxAttempts: 5,
        failedReason: "Disk full",
      }),
    );

    unwatch();
  });

  it("does not trigger onExhausted when attempts remain", async () => {
    const watcher = new QueueEventsWatcher("test-queue");
    const onExhausted = vi.fn();

    const getJobFn = vi.fn().mockResolvedValue({
      name: "sync-roles",
      attemptsMade: 2,
      opts: { attempts: 5 },
    });

    watcher.watchExhaustedRetries(getJobFn, onExhausted);
    await lastEventHandler!({ jobId: "job-failed-2", failedReason: "Temporary timeout" });
    await new Promise((r) => setTimeout(r, 10));

    expect(onExhausted).not.toHaveBeenCalled();
  });

  it("watchFailedJobs attaches to queue and logs exhausted failure", async () => {
    const mockLogger = { error: vi.fn(), warn: vi.fn() };
    const onExhausted = vi.fn();

    const mockQueue = {
      queue: "my-task-queue",
      client: {
        getJob: vi.fn().mockResolvedValue({
          name: "heavy-job",
          attemptsMade: 3,
          opts: { attempts: 3 },
          failedReason: "OOM",
        }),
      },
    };

    const watcherHandle = watchFailedJobs(mockQueue as any, mockLogger, onExhausted);
    expect(lastEventHandler).toBeDefined();

    await lastEventHandler!({ jobId: "j-99", failedReason: "OOM" });
    await new Promise((r) => setTimeout(r, 10));

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("Job 'heavy-job' failed after 3 attempt(s)"),
    );
    expect(onExhausted).toHaveBeenCalled();

    await watcherHandle.close();
  });
});

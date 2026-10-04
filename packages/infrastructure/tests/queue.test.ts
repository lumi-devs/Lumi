import { describe, it, expect, vi, beforeEach } from "bun:test";
import { QueueService } from "../src/services/queue-service.js";
import { TaskQueueProducer } from "../src/queues/producer.js";

// Mock BullMQ Queue so tests run fully offline
const mockQueueInstances: any[] = [];

vi.mock("bullmq", () => {
  class MockQueue {
    public name: string;
    public options: any;
    public add = vi.fn().mockImplementation(async (name, data, opts) => ({ id: "job-1", name, data, opts }));
    public addBulk = vi.fn().mockImplementation(async (jobs) => jobs.map((j: any, i: number) => ({ id: `job-${i}`, ...j })));
    public getJob = vi.fn().mockImplementation(async (id) => ({ id, name: "task", data: {}, remove: vi.fn() }));
    public getJobCounts = vi.fn().mockResolvedValue({ completed: 5, failed: 1, waiting: 0 });
    public clean = vi.fn().mockResolvedValue(["job-old"]);
    public drain = vi.fn().mockResolvedValue(undefined);
    public pause = vi.fn().mockResolvedValue(undefined);
    public resume = vi.fn().mockResolvedValue(undefined);
    public close = vi.fn().mockResolvedValue(undefined);

    public constructor(name: string, options: any) {
      this.name = name;
      this.options = options;
      mockQueueInstances.push(this);
    }
  }

  return {
    Queue: MockQueue,
  };
});

describe("QueueService & TaskQueueProducer", () => {
  beforeEach(() => {
    mockQueueInstances.length = 0;
    vi.clearAllMocks();
  });

  it("caches and returns the same queue instance for a given name", async () => {
    const service = new QueueService({
      connection: { host: "127.0.0.1", port: 6379 },
    });

    const q1 = service.getQueue("moderation-tasks");
    const q2 = service.getQueue("moderation-tasks");
    expect(q1).toBe(q2);
    expect(mockQueueInstances).toHaveLength(1);

    const qOther = service.getQueue("email-tasks");
    expect(qOther).not.toBe(q1);
    expect(mockQueueInstances).toHaveLength(2);

    await service.closeAll();
    expect(mockQueueInstances[0].close).toHaveBeenCalled();
    expect(mockQueueInstances[1].close).toHaveBeenCalled();
  });

  it("TaskQueueProducer schedules one-off and repeating jobs", async () => {
    const producer = new TaskQueueProducer("scheduled-tasks");

    // Immediate
    await producer.schedule("audit-cleanup");
    const q = producer.queue.rawQueue;
    expect(q.add).toHaveBeenCalledWith("audit-cleanup", undefined, undefined);

    // With delay
    await producer.schedule({ name: "unban-user", payload: { userId: "u-1" } }, 5000);
    expect(q.add).toHaveBeenCalledWith("unban-user", { userId: "u-1" }, { delay: 5000 });

    // Repeating cron pattern
    await producer.schedule(
      { name: "backup-sweep" },
      { repeated: true, pattern: "0 0 * * *", timezone: "UTC" },
    );
    expect(q.add).toHaveBeenCalledWith(
      "backup-sweep",
      undefined,
      expect.objectContaining({
        repeat: { pattern: "0 0 * * *", tz: "UTC" },
      }),
    );
  });

  it("deletes a job from queue by id", async () => {
    const producer = new TaskQueueProducer("test-delete-queue");
    const deleted = await producer.delete("job-123");
    expect(deleted).toBe(true);

    await producer.close();
  });
});

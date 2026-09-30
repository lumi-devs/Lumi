import { describe, it, expect } from "bun:test";
import { checkQueueHealth } from "#lib/doctor/checks/queue-health.js";

describe("checkQueueHealth", () => {
  it("fails when the queue counts can't be read", async () => {
    const result = await checkQueueHealth({
      getJobCounts: () => Promise.reject(new Error("ECONNREFUSED")),
    });
    expect(result.status).toBe("fail");
  });

  it("ok on a healthy queue", async () => {
    const result = await checkQueueHealth({
      getJobCounts: () => Promise.resolve({ failed: 2, waiting: 5, delayed: 1 }),
    });
    expect(result.status).toBe("ok");
  });

  it("warns when the failed count exceeds the threshold", async () => {
    const result = await checkQueueHealth({
      getJobCounts: () => Promise.resolve({ failed: 100, waiting: 0, delayed: 0 }),
      failedWarnThreshold: 50,
    });
    expect(result.status).toBe("warn");
  });
});

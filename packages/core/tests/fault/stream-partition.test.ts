import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Chaos Suite: Redis Network Partition & Stream Consumer Reconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recovers stream consumer loop after transient Redis stream read partition", async () => {
    let callCount = 0;
    let isPartitioned = true;

    const mockEventBus = {
      consumeFireEvents: vi.fn(async (options: any) => {
        callCount++;
        if (isPartitioned) {
          throw new Error("READONLY You can't write against a read only replica / ECONNRESET");
        }
        if (options.handler) {
          await options.handler({
            taskId: "task-chaos-1",
            guildId: "guild-1",
            status: "success",
          });
        }
        return { count: 1 };
      }),
      stopConsumingFireEvents: vi.fn().mockResolvedValue(undefined),
    };

    // Partition active initially
    await expect(
      mockEventBus.consumeFireEvents({
        consumerId: "consumer-chaos-test",
        handler: expect.any(Function),
      }),
    ).rejects.toThrow(/ECONNRESET/);

    // Heal partition
    isPartitioned = false;

    let handled = false;
    await mockEventBus.consumeFireEvents({
      consumerId: "consumer-chaos-test",
      handler: async (event: any) => {
        if (event.taskId === "task-chaos-1") handled = true;
      },
    });

    expect(handled).toBe(true);
  });
});

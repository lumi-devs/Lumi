import { beforeEach, describe, expect, it, vi } from "vitest";
import { container } from "@sapphire/framework";
import {
  handleSendMessageFire,
  queueSend,
} from "#lib/outbound/send-queue.js";
import { scheduleTask } from "#lib/schedule-task.js";

vi.mock("#lib/schedule-task.js", () => ({
  scheduleTask: vi.fn().mockResolvedValue(undefined),
  cancelTask: vi.fn().mockResolvedValue(undefined),
}));

/** Records send start/finish order so overlap can be asserted. */
const events: string[] = [];

function makeChannel(id: string, delayMs: number) {
  return {
    isTextBased: () => true,
    send: vi.fn(async (_payload?: unknown) => {
      events.push(`start:${id}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      events.push(`end:${id}`);
    }),
  };
}

const channels = new Map<string, ReturnType<typeof makeChannel>>();

beforeEach(() => {
  vi.clearAllMocks();
  events.length = 0;
  channels.clear();

  container.logger = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  } as never;

  container.client = {
    channels: {
      cache: { get: (id: string) => channels.get(id) },
      fetch: (id: string) => Promise.resolve(channels.get(id) ?? null),
    },
  } as never;
});

describe("queueSend", () => {
  it("hands the send to the scheduler and stamps the time", async () => {
    await queueSend({ channelId: "c1", content: "hello" });

    expect(scheduleTask).toHaveBeenCalledWith(
      "send-message",
      expect.objectContaining({
        channelId: "c1",
        content: "hello",
        at: expect.any(Number),
      }),
    );
  });

  it("sends inline when the queue is unreachable", async () => {
    const channel = makeChannel("c1", 0);
    channels.set("c1", channel);
    vi.mocked(scheduleTask).mockRejectedValueOnce(new Error("redis down"));

    await queueSend({ channelId: "c1", content: "hello" });

    expect(channel.send).toHaveBeenCalledWith("hello");
    expect(container.logger.warn).toHaveBeenCalled();
  });
});

describe("handleSendMessageFire", () => {
  it("serializes sends to the same channel", async () => {
    channels.set("c1", makeChannel("c1", 20));

    await Promise.all([
      handleSendMessageFire({ channelId: "c1", content: "a" }),
      handleSendMessageFire({ channelId: "c1", content: "b" }),
    ]);

    // A rate-limited channel parks one slot; it never interleaves with itself.
    expect(events).toEqual(["start:c1", "end:c1", "start:c1", "end:c1"]);
  });

  it("lets different channels proceed concurrently", async () => {
    channels.set("c1", makeChannel("c1", 30));
    channels.set("c2", makeChannel("c2", 5));

    await Promise.all([
      handleSendMessageFire({ channelId: "c1", content: "a" }),
      handleSendMessageFire({ channelId: "c2", content: "b" }),
    ]);

    // c2 finishes while c1 is still in flight.
    expect(events).toEqual(["start:c1", "start:c2", "end:c2", "end:c1"]);
  });

  it("drops sends for channels that cannot be resolved", async () => {
    await expect(
      handleSendMessageFire({ channelId: "gone", content: "a" }),
    ).resolves.toBeUndefined();
    expect(events).toEqual([]);
  });

  it("propagates transport failures so the consumer can redeliver", async () => {
    channels.set("c1", {
      isTextBased: () => true,
      send: vi.fn().mockRejectedValue(new Error("500 Internal Server Error")),
    });

    await expect(
      handleSendMessageFire({ channelId: "c1", content: "a" }),
    ).rejects.toThrow("500");
  });

  it("renders an audit entry as a card", async () => {
    const channel = makeChannel("c1", 0);
    channels.set("c1", channel);

    await handleSendMessageFire({
      channelId: "c1",
      at: Date.now(),
      auditEntry: {
        guildId: "g1",
        action: "Ban",
        targetId: "111111111111111111",
        actorId: "222222222222222222",
        reason: "spam",
        caseNumber: 7,
      },
    });

    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(channel.send.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ components: expect.anything() }),
    );
  });
});

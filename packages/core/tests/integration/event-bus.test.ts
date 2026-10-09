import { afterAll, afterEach, beforeAll, expect, it } from "bun:test";
import type Valkey from "iovalkey";
import { createEventBus, type OwnedEventBus } from "#lib/event-bus/factory.js";
import type { BusMessage } from "#lib/event-bus/types.js";
import { createTestValkey, integrationDescribe, parseTestValkeyOptions } from "./setup.js";

const StreamPrefix = "lumi:test:int:events:";

function uniqueStream(): string {
  return `${StreamPrefix}${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

integrationDescribe("StreamBus (real Valkey)", () => {
  let owned: OwnedEventBus;
  let valkey: Valkey;
  const streams: string[] = [];
  const stops: Array<() => Promise<void>> = [];

  beforeAll(() => {
    valkey = createTestValkey();
    owned = createEventBus({
      valkey: parseTestValkeyOptions(),
      // Deterministic tests - no background claim/stats ticks to race against.
      claimIntervalMs: 0,
      statsIntervalMs: 0,
    });
  });

  afterEach(async () => {
    await Promise.all(stops.splice(0).map((stop) => stop().catch(() => undefined)));
    await Promise.all(
      streams.splice(0).map((stream) => valkey.del(stream, `${stream}:dlq`).catch(() => undefined)),
    );
  });

  afterAll(async () => {
    await owned.close();
    await valkey.quit();
  });

  it("publish() returns an assigned message id and XADDs onto the stream", async () => {
    const stream = uniqueStream();
    streams.push(stream);

    const id = await owned.bus.publish(stream, { hello: "world" });
    expect(id).toMatch(/^\d+-\d+$/);

    const len = await valkey.xlen(stream);
    expect(len).toBe(1);
  });

  it("consume() delivers a published message via a consumer group and ack() removes it from pending", async () => {
    const stream = uniqueStream();
    streams.push(stream);
    const group = "test-group";

    await owned.bus.publish(stream, { n: 1 });

    const received: Array<BusMessage<{ n: number }>> = [];
    let resolveDelivered: () => void = () => undefined;
    const delivered = new Promise<void>((resolve) => {
      resolveDelivered = resolve;
    });

    const stop = await owned.bus.consume<{ n: number }>(
      [stream],
      { group, consumer: "consumer-1", blockMs: 200, batchSize: 8 },
      async (msg) => {
        received.push(msg);
        await msg.ack();
        resolveDelivered();
      },
    );
    stops.push(stop);

    await delivered;

    expect(received.length).toBe(1);
    expect(received[0]!.body).toEqual({ n: 1 });
    expect(received[0]!.deliveryCount).toBe(1);

    const pending = (await valkey.xpending(stream, group)) as [number, ...unknown[]];
    expect(pending[0]).toBe(0);
  });

  it("two published messages are both delivered and acked in order", async () => {
    const stream = uniqueStream();
    streams.push(stream);
    const group = "test-group-order";

    await owned.bus.publish(stream, { n: 1 });
    await owned.bus.publish(stream, { n: 2 });

    const received: number[] = [];
    let resolveDone: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const stop = await owned.bus.consume<{ n: number }>(
      [stream],
      { group, consumer: "consumer-1", blockMs: 200, batchSize: 8 },
      async (msg) => {
        received.push(msg.body.n);
        await msg.ack();
        if (received.length === 2) resolveDone();
      },
    );
    stops.push(stop);

    await done;

    expect(received).toEqual([1, 2]);
  });
});

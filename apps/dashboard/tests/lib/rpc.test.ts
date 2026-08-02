import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RpcResponse } from "@lumi/contracts";

// Fakes the two `amqp-connection-manager` collaborators RpcClient touches:
// the "connection" (isConnected/createChannel/close) and the "channel
// wrapper" (sendToQueue/waitForConnect/close). `createChannel` synchronously
// invokes the real `setup` callback RpcClient passes in — mirroring what
// amqp-connection-manager does once the underlying AMQP channel opens — so
// `#setup`'s `ch.consume(REPLY_QUEUE, ...)` registration actually runs and
// we can capture its callback to simulate an incoming RPC reply.
type ConsumeCallback = (msg: {
  properties: { correlationId?: string };
  content: Buffer;
}) => void;

let capturedConsume: ConsumeCallback | undefined;

const fakeChannel = {
  assertQueue: vi.fn().mockResolvedValue(undefined),
  consume: vi.fn((_queue: string, cb: ConsumeCallback) => {
    capturedConsume = cb;
    return Promise.resolve();
  }),
};

const fakeChannelWrapper = {
  sendToQueue: vi.fn().mockResolvedValue(undefined),
  waitForConnect: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
};

const fakeConnection = {
  isConnected: vi.fn(() => true),
  createChannel: vi.fn((opts: { setup: (ch: typeof fakeChannel) => unknown }) => {
    void opts.setup(fakeChannel);
    return fakeChannelWrapper;
  }),
  close: vi.fn().mockResolvedValue(undefined),
};

const connect = vi.fn(() => fakeConnection);
vi.mock("amqp-connection-manager", () => ({ default: { connect } }));

// lib/rpc.ts also imports `#/lib/env` (for the `getRpcClient()`/`rpcCall()`
// convenience wrappers) — env.ts throws at *module load* time if
// RABBITMQ_URL etc. aren't set, which they deliberately aren't in a unit
// test environment. `RpcClient` itself doesn't read `env`, but importing
// the module would still throw without this.
vi.mock("#/lib/env", () => ({
  env: { rabbitUrl: "amqp://unused" },
}));

const { RpcClient } = await import("#/lib/rpc");

/** Pull the correlationId RpcClient generated for the most recent `sendToQueue` call. */
function lastCorrelationId(): string {
  const calls = fakeChannelWrapper.sendToQueue.mock.calls;
  const opts = calls[calls.length - 1]?.[2] as { correlationId: string };
  return opts.correlationId;
}

function replyWith(response: RpcResponse): void {
  const correlationId = lastCorrelationId();
  capturedConsume?.({
    properties: { correlationId },
    content: Buffer.from(JSON.stringify({ ...response, id: correlationId })),
  });
}

describe("RpcClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedConsume = undefined;
  });

  it("wires up the reply-to consumer and asserts the request queue on construction", async () => {
    new RpcClient("amqp://fake");
    await vi.waitFor(() => expect(capturedConsume).toBeDefined());
    expect(fakeChannel.assertQueue).toHaveBeenCalledWith(
      "lumi.rpc.requests",
      { durable: true },
    );
    expect(fakeChannel.consume).toHaveBeenCalledWith(
      "amq.rabbitmq.reply-to",
      expect.any(Function),
      { noAck: true },
    );
  });

  it("resolves call() with response.data once a matching reply arrives", async () => {
    const client = new RpcClient("amqp://fake");
    await vi.waitFor(() => expect(capturedConsume).toBeDefined());

    const promise = client.call("guild.dashboard.get", {
      guildId: "101",
      actorId: "1",
    });
    replyWith({ id: "unused", ok: true, data: { name: "My Guild" } });

    await expect(promise).resolves.toEqual({ name: "My Guild" });
  });

  it("sends the request on the well-known RPC queue with guildId/actorId/data in the payload", async () => {
    const client = new RpcClient("amqp://fake");
    await vi.waitFor(() => expect(capturedConsume).toBeDefined());

    const promise = client.call("guild.module.toggle", {
      guildId: "101",
      actorId: "1",
      data: { moduleName: "afk", enabled: false },
    });
    replyWith({ id: "unused", ok: true, data: { success: true } });
    await promise;

    const [queue, buf] = fakeChannelWrapper.sendToQueue.mock.calls[0]!;
    expect(queue).toBe("lumi.rpc.requests");
    const sent = JSON.parse((buf as Buffer).toString());
    expect(sent).toMatchObject({
      action: "guild.module.toggle",
      guildId: "101",
      actorId: "1",
      data: { moduleName: "afk", enabled: false },
    });
  });

  it("rejects with the server's error message when the reply has ok: false", async () => {
    const client = new RpcClient("amqp://fake");
    await vi.waitFor(() => expect(capturedConsume).toBeDefined());

    const promise = client.call("guild.dashboard.get", { guildId: "101" });
    replyWith({ id: "unused", ok: false, error: "Guild not found in bot cache" });

    await expect(promise).rejects.toThrow("Guild not found in bot cache");
  });

  it("rejects with a generic error when ok: false but no error message is given", async () => {
    const client = new RpcClient("amqp://fake");
    await vi.waitFor(() => expect(capturedConsume).toBeDefined());

    const promise = client.call("guild.dashboard.get", { guildId: "101" });
    replyWith({ id: "unused", ok: false });

    await expect(promise).rejects.toThrow("RPC error");
  });

  it("times out and rejects if no reply ever arrives", async () => {
    const client = new RpcClient("amqp://fake");
    await vi.waitFor(() => expect(capturedConsume).toBeDefined());

    await expect(
      client.call("guild.dashboard.get", { guildId: "101", timeoutMs: 15 }),
    ).rejects.toThrow("RPC timed out: guild.dashboard.get");
  });

  it("rejects immediately if sendToQueue itself fails (broker unreachable)", async () => {
    const client = new RpcClient("amqp://fake");
    await vi.waitFor(() => expect(capturedConsume).toBeDefined());

    fakeChannelWrapper.sendToQueue.mockRejectedValueOnce(
      new Error("channel closed"),
    );
    await expect(
      client.call("guild.dashboard.get", { guildId: "101" }),
    ).rejects.toThrow("channel closed");
  });

  it("discards a reply whose body isn't valid JSON without crashing, logging instead", async () => {
    const log = vi.fn();
    new RpcClient("amqp://fake", log);
    await vi.waitFor(() => expect(capturedConsume).toBeDefined());

    expect(() =>
      capturedConsume?.({
        properties: { correlationId: "whatever" },
        content: Buffer.from("not json"),
      }),
    ).not.toThrow();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("Discarding undecodable RPC reply"),
    );
  });

  it("ignores a reply message with no correlationId", async () => {
    new RpcClient("amqp://fake");
    await vi.waitFor(() => expect(capturedConsume).toBeDefined());

    expect(() =>
      capturedConsume?.({
        properties: {},
        content: Buffer.from(JSON.stringify({ ok: true, data: {} })),
      }),
    ).not.toThrow();
  });

  it("connected reflects the underlying connection's isConnected()", () => {
    fakeConnection.isConnected.mockReturnValue(false);
    const client = new RpcClient("amqp://fake");
    expect(client.connected).toBe(false);

    fakeConnection.isConnected.mockReturnValue(true);
    expect(client.connected).toBe(true);
  });

  it("waitForConnect() delegates to the channel wrapper", async () => {
    const client = new RpcClient("amqp://fake");
    await client.waitForConnect();
    expect(fakeChannelWrapper.waitForConnect).toHaveBeenCalledOnce();
  });

  it("close() closes both the channel and the connection, swallowing errors", async () => {
    fakeChannelWrapper.close.mockRejectedValueOnce(new Error("already closed"));
    fakeConnection.close.mockRejectedValueOnce(new Error("already closed"));
    const client = new RpcClient("amqp://fake");

    await expect(client.close()).resolves.toBeUndefined();
    expect(fakeChannelWrapper.close).toHaveBeenCalledOnce();
    expect(fakeConnection.close).toHaveBeenCalledOnce();
  });
});

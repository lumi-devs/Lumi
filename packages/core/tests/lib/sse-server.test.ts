import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { container } from "@sapphire/framework";
import {
  handleSseRequest,
  closeAllSseConnections,
  _activeSseConnectionCount,
  MaxSseConnections,
} from "#lib/rpc/sse-server.js";
import { dashboardEventPublishFailures } from "@lumi/observability";
import { FakeDiscordRestPort } from "#lib/discord/fake-rest-port.js";

const GUILD_ID = "123456789012345678";
const OTHER_GUILD_ID = "987654321098765432";
const OWNER_ID = "111111111111111111";
const INTRUDER_ID = "222222222222222222";

function everyoneRole(permissions = "0") {
  return { id: GUILD_ID, permissions };
}

type CapturedHandler = (msg: {
  id: string;
  deliveryCount: number;
  ack: () => Promise<void>;
  nack: () => Promise<void>;
  body: unknown;
}) => Promise<void>;

describe("SSE endpoint (apps/api /events)", () => {
  let consumeFn: ReturnType<typeof vi.fn>;
  let destroyGroupFn: ReturnType<typeof vi.fn>;
  let stopFn: ReturnType<typeof vi.fn>;
  let capturedHandler: CapturedHandler | null;

  beforeEach(() => {
    capturedHandler = null;
    dashboardEventPublishFailures.reset();
    stopFn = vi.fn().mockResolvedValue(undefined);
    destroyGroupFn = vi.fn().mockResolvedValue(undefined);
    consumeFn = vi
      .fn()
      .mockImplementation(async (_streams: string[], _opts: unknown, handler: CapturedHandler) => {
        capturedHandler = handler;
        return stopFn;
      });

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    (container as any).eventBus = {
      consume: consumeFn,
      destroyGroup: destroyGroupFn,
      publish: vi.fn().mockResolvedValue("1-0"),
      close: vi.fn(),
    };

    const discordRest = new FakeDiscordRestPort();
    discordRest.seedGuild({ id: GUILD_ID, owner_id: OWNER_ID, roles: [everyoneRole()] } as any);
    discordRest.seedGuild({
      id: OTHER_GUILD_ID,
      owner_id: OWNER_ID,
      roles: [{ id: OTHER_GUILD_ID, permissions: "0" }],
    } as any);
    discordRest.seedMember(GUILD_ID, { user: { id: INTRUDER_ID }, roles: [] } as any);
    (container as any).discordRest = discordRest;
  });

  afterEach(async () => {
    await closeAllSseConnections();
  });

  function request(guildId: string | null, actorId: string | null): Request {
    const params = new URLSearchParams();
    if (guildId) params.set("guildId", guildId);
    if (actorId) params.set("actorId", actorId);
    return new Request(`http://127.0.0.1/events?${params.toString()}`);
  }

  async function open(guildId: string, actorId: string) {
    const res = await handleSseRequest(request(guildId, actorId));
    // The shared subscription starts lazily and asynchronously on the
    // connection's own start() tick - flush microtasks so `capturedHandler`
    // (and, for later connections, the "already started" fast path) settle.
    await Promise.resolve();
    await Promise.resolve();
    return res;
  }

  it("rejects when guildId is missing or malformed", async () => {
    const res = await handleSseRequest(request(null, OWNER_ID));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("BAD_REQUEST");
  });

  it("rejects an actor without ManageGuild on the guild", async () => {
    const res = await handleSseRequest(request(GUILD_ID, INTRUDER_ID));
    expect(res.status).toBe(403);
    expect(consumeFn).not.toHaveBeenCalled();
  });

  it("opens exactly one shared consume() subscription for many connections", async () => {
    const res1 = await open(GUILD_ID, OWNER_ID);
    const res2 = await open(GUILD_ID, OWNER_ID);
    const res3 = await open(OTHER_GUILD_ID, OWNER_ID);

    expect([res1, res2, res3].every((r) => r.status === 200)).toBe(true);
    expect(consumeFn).toHaveBeenCalledTimes(1);
    expect(_activeSseConnectionCount()).toBe(3);

    await res1.body!.cancel();
    await res2.body!.cancel();
    await res3.body!.cancel();
  });

  it("scopes delivered events to the subscribed guild only", async () => {
    const res = await open(GUILD_ID, OWNER_ID);
    expect(capturedHandler).not.toBeNull();

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    const ackOther = vi.fn().mockResolvedValue(undefined);
    await capturedHandler!({
      id: "1-0",
      deliveryCount: 1,
      ack: ackOther,
      nack: vi.fn(),
      body: {
        type: "module.stateChanged",
        v: 1,
        guildId: OTHER_GUILD_ID,
        moduleName: "afk",
        enabled: true,
        actorId: OWNER_ID,
        at: Date.now(),
      },
    });
    // Every delivered entry is acked at the shared-subscription level - fan-
    // out to zero interested connections is still a successful delivery.
    expect(ackOther).toHaveBeenCalled();

    const ackMine = vi.fn().mockResolvedValue(undefined);
    await capturedHandler!({
      id: "2-0",
      deliveryCount: 1,
      ack: ackMine,
      nack: vi.fn(),
      body: {
        type: "module.stateChanged",
        v: 1,
        guildId: GUILD_ID,
        moduleName: "afk",
        enabled: true,
        actorId: OWNER_ID,
        at: Date.now(),
      },
    });
    expect(ackMine).toHaveBeenCalled();

    const { value } = await reader.read();
    const chunk = decoder.decode(value);
    expect(chunk).toContain(GUILD_ID);
    expect(chunk).not.toContain(OTHER_GUILD_ID);

    await reader.cancel();
  });

  it("delivers a published event end-to-end through the shared consume callback", async () => {
    const res = await open(GUILD_ID, OWNER_ID);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    const event = {
      type: "config.changed",
      v: 1,
      guildId: GUILD_ID,
      moduleName: "afk",
      key: "channel",
      actorId: OWNER_ID,
      at: Date.now(),
    };
    await capturedHandler!({
      id: "3-0",
      deliveryCount: 1,
      ack: vi.fn().mockResolvedValue(undefined),
      nack: vi.fn(),
      body: event,
    });

    const { value } = await reader.read();
    const chunk = decoder.decode(value);
    expect(JSON.parse(chunk.replace(/^data: /, "").trim())).toEqual(event);

    await reader.cancel();
  });

  it("drops a malformed event body instead of forwarding it to connections", async () => {
    const res = await open(GUILD_ID, OWNER_ID);
    const reader = res.body!.getReader();

    const ack = vi.fn().mockResolvedValue(undefined);
    await capturedHandler!({
      id: "bad-0",
      deliveryCount: 1,
      ack,
      nack: vi.fn(),
      body: {
        type: "module.stateChanged",
        v: 1,
        guildId: GUILD_ID,
        moduleName: "afk",
        enabled: "not-a-boolean",
        actorId: OWNER_ID,
        at: Date.now(),
      },
    });

    expect(ack).toHaveBeenCalled();
    expect(container.logger.warn).toHaveBeenCalled();
    expect((await dashboardEventPublishFailures.get()).values).toContainEqual(
      expect.objectContaining({ labels: { reason: "invalid" }, value: 1 }),
    );

    await reader.cancel();
  });

  it("a disconnected connection is dropped from fan-out without blocking delivery to others", async () => {
    const resGood = await open(GUILD_ID, OWNER_ID);
    const resBad = await open(GUILD_ID, OWNER_ID);
    expect(_activeSseConnectionCount()).toBe(2);

    const goodReader = resGood.body!.getReader();
    const badReader = resBad.body!.getReader();
    // Simulates the client going away mid-session: `cancel()` runs the same
    // `close()` path a broken pipe would, synchronously dropping it from
    // `connectionsByGuild` before the next fan-out - the other connection's
    // delivery must not depend on this one, or see it throw.
    await badReader.cancel();

    const decoder = new TextDecoder();
    const event = {
      type: "module.stateChanged",
      v: 1,
      guildId: GUILD_ID,
      moduleName: "afk",
      enabled: false,
      actorId: OWNER_ID,
      at: Date.now(),
    };
    await capturedHandler!({
      id: "4-0",
      deliveryCount: 1,
      ack: vi.fn().mockResolvedValue(undefined),
      nack: vi.fn(),
      body: event,
    });

    // The cancelled connection is gone; the still-open one still received it.
    expect(_activeSseConnectionCount()).toBe(1);
    const { value } = await goodReader.read();
    expect(JSON.parse(decoder.decode(value).replace(/^data: /, "").trim())).toEqual(event);

    await goodReader.cancel();
  });

  it("stops the shared subscription and destroys its group only once the last connection closes", async () => {
    const res1 = await open(GUILD_ID, OWNER_ID);
    const res2 = await open(GUILD_ID, OWNER_ID);
    expect(consumeFn).toHaveBeenCalledTimes(1);

    await res1.body!.cancel();
    expect(stopFn).not.toHaveBeenCalled();
    expect(destroyGroupFn).not.toHaveBeenCalled();
    expect(_activeSseConnectionCount()).toBe(1);

    await res2.body!.cancel();
    await Promise.resolve();

    expect(stopFn).toHaveBeenCalledTimes(1);
    expect(destroyGroupFn).toHaveBeenCalledTimes(1);
    expect(_activeSseConnectionCount()).toBe(0);
  });

  it("restarts the shared subscription for a connection after full idle teardown", async () => {
    const res1 = await open(GUILD_ID, OWNER_ID);
    await res1.body!.cancel();
    await Promise.resolve();
    expect(stopFn).toHaveBeenCalledTimes(1);

    const res2 = await open(GUILD_ID, OWNER_ID);
    expect(consumeFn).toHaveBeenCalledTimes(2);

    await res2.body!.cancel();
  });

  it("enforces the per-process connection cap", async () => {
    const responses: Response[] = [];
    for (let i = 0; i < MaxSseConnections; i++) {
      responses.push(await open(GUILD_ID, OWNER_ID));
    }
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(_activeSseConnectionCount()).toBe(MaxSseConnections);
    expect(consumeFn).toHaveBeenCalledTimes(1);

    const overflow = await handleSseRequest(request(GUILD_ID, OWNER_ID));
    expect(overflow.status).toBe(503);

    await Promise.all(responses.map((r) => r.body!.cancel()));
  });
});

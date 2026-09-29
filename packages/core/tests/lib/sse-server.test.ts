import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { container } from "@sapphire/framework";
import {
  handleSseRequest,
  closeAllSseConnections,
  _activeSseConnectionCount,
  MaxSseConnections,
} from "#lib/rpc/sse-server.js";

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
  let restGet: ReturnType<typeof vi.fn>;
  let consumeFn: ReturnType<typeof vi.fn>;
  let destroyGroupFn: ReturnType<typeof vi.fn>;
  let stopFn: ReturnType<typeof vi.fn>;
  let capturedHandler: CapturedHandler | null;

  beforeEach(() => {
    capturedHandler = null;
    stopFn = vi.fn().mockResolvedValue(undefined);
    destroyGroupFn = vi.fn().mockResolvedValue(undefined);
    consumeFn = vi.fn().mockImplementation(async (_streams: string[], _opts: unknown, handler: CapturedHandler) => {
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

    restGet = vi.fn().mockImplementation((route: string) => {
      if (route === `/guilds/${GUILD_ID}`) {
        return Promise.resolve({ id: GUILD_ID, owner_id: OWNER_ID, roles: [everyoneRole()] });
      }
      if (route === `/guilds/${GUILD_ID}/members/${INTRUDER_ID}`) {
        return Promise.resolve({ roles: [] });
      }
      return Promise.reject(new Error(`Unexpected route: ${route}`));
    });
    container.client = { rest: { get: restGet } } as any;
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

  it("rejects when guildId is missing or malformed", async () => {
    const res = await handleSseRequest(request(null, OWNER_ID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("BAD_REQUEST");
  });

  it("rejects an actor without ManageGuild on the guild", async () => {
    const res = await handleSseRequest(request(GUILD_ID, INTRUDER_ID));
    expect(res.status).toBe(403);
    expect(consumeFn).not.toHaveBeenCalled();
  });

  it("scopes delivered events to the subscribed guild only", async () => {
    const res = await handleSseRequest(request(GUILD_ID, OWNER_ID));
    expect(res.status).toBe(200);
    await Promise.resolve();
    await Promise.resolve();
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
        guildId: OTHER_GUILD_ID,
        moduleName: "afk",
        enabled: true,
        actorId: OWNER_ID,
        at: Date.now(),
      },
    });
    // Every delivered entry is acked regardless of guild match - the
    // ephemeral per-connection group has no other consumer to redeliver to.
    expect(ackOther).toHaveBeenCalled();

    const ackMine = vi.fn().mockResolvedValue(undefined);
    await capturedHandler!({
      id: "2-0",
      deliveryCount: 1,
      ack: ackMine,
      nack: vi.fn(),
      body: {
        type: "module.stateChanged",
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

  it("delivers a published event end-to-end through the consume callback", async () => {
    const res = await handleSseRequest(request(GUILD_ID, OWNER_ID));
    await Promise.resolve();
    await Promise.resolve();

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    const event = {
      type: "config.changed",
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

  it("stops consuming and destroys the ephemeral consumer group on disconnect", async () => {
    const res = await handleSseRequest(request(GUILD_ID, OWNER_ID));
    await Promise.resolve();
    await Promise.resolve();
    expect(_activeSseConnectionCount()).toBe(1);

    await res.body!.cancel();
    await Promise.resolve();

    expect(stopFn).toHaveBeenCalledTimes(1);
    expect(destroyGroupFn).toHaveBeenCalledTimes(1);
    expect(_activeSseConnectionCount()).toBe(0);
  });

  it("enforces the per-process connection cap", async () => {
    const responses: Response[] = [];
    for (let i = 0; i < MaxSseConnections; i++) {
      responses.push(await handleSseRequest(request(GUILD_ID, OWNER_ID)));
    }
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(_activeSseConnectionCount()).toBe(MaxSseConnections);

    const overflow = await handleSseRequest(request(GUILD_ID, OWNER_ID));
    expect(overflow.status).toBe(503);
  });
});

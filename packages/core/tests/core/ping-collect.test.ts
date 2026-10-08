import { describe, it, expect, vi, beforeEach, spyOn } from "bun:test";
import { container } from "#lib/services.js";
import {
  collectPingData,
  getRuntimeLabel,
  resetPingCachesForTests,
} from "#modules/core/services/ping-collect.js";

const Semver = /^\d+\.\d+\.\d+/;

describe("collectPingData", () => {
  beforeEach(() => {
    resetPingCachesForTests();
    spyOn(globalThis, "fetch").mockResolvedValue(new Response("colo=LHR\n"));

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    (container as any).client = {
      ws: { ping: 42 },
      shard: null,
      uptime: 1000,
      isReady: () => true,
      guilds: { cache: { size: 0, reduce: (_fn: unknown, seed: number) => seed } },
      channels: { cache: { size: 0 } },
      user: {
        id: "bot-1",
        username: "Lumi",
        displayAvatarURL: () => "https://cdn/bot.png",
      },
    };
    (container as any).valkey = {
      info: vi.fn().mockResolvedValue("valkey_version:9.0.5\nuptime_in_seconds:10\n"),
      dbsize: vi.fn().mockResolvedValue(0),
      ping: vi.fn().mockResolvedValue("PONG"),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
    };
    (container as any).db = {
      probePrisma: vi.fn().mockResolvedValue(1),
      getPostgresStats: vi.fn().mockRejectedValue(new Error("no db")),
    };
    (container as any).moduleStore = { loaded: () => [] };
    (container as any).stats = { identifies: 0, resumes: 0, messages: 0 };
  });

  it("reports the library versions it was built against", async () => {
    const data = await collectPingData(container);

    expect(data.djsVersion).toMatch(Semver);
    expect(data.prismaVersion).toMatch(Semver);
  });

  it("names the runtime it is executing on", () => {
    expect(getRuntimeLabel()).toMatch(/^(Bun v|Node\.js )/);
  });

  it("passes an abort signal with a bounded timeout to the gateway-node lookup", async () => {
    await collectPingData(container);

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("falls back to Unknown instead of throwing when the gateway-node fetch times out", async () => {
    spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("The operation was aborted.", "TimeoutError"));

    const data = await collectPingData(container);

    expect(data.gatewayNode).toBe("Unknown");
  });

  it("falls back to Unknown instead of throwing when the gateway-node fetch rejects", async () => {
    spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const data = await collectPingData(container);

    expect(data.gatewayNode).toBe("Unknown");
  });
});

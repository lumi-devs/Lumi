import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { container } from "@sapphire/framework";
import { dispatchRpc, resetDiscordBulkheadForTests } from "#lib/rpc/dispatch.js";
import { registerRpcHandlers } from "#lib/rpc/registry.js";
import { repositoryCache } from "#lib/prisma/repositories/Repository.js";
import { registry } from "@lumi/observability";

const GUILD_ID = "123456789012345678";
const ACTOR_ID = "222222222222222222";

/** A deferred guild lookup on the Discord REST port so a test controls exactly when "Discord" answers. */
function deferredGuildRest() {
  let resolve!: () => void;
  const gate = new Promise<void>((r) => (resolve = r));
  const get = vi.fn().mockImplementation(async () => {
    await gate;
    return { id: GUILD_ID, owner_id: ACTOR_ID, roles: [{ id: GUILD_ID, permissions: "0" }] };
  });
  (container as any).discordRest = {
    fetchGuild: get,
    fetchMember: vi.fn().mockResolvedValue({ user: { id: ACTOR_ID }, roles: [] }),
  };
  return { get, resolve };
}

async function metricValue(name: string, labels: Record<string, string>) {
  const metric = await registry.getSingleMetric(name)?.get();
  return metric?.values.find((v) =>
    Object.entries(labels).every(([k, val]) => v.labels[k] === val),
  )?.value;
}

describe("RPC dispatch: Discord bulkhead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;
    (container as any).redis = { get: vi.fn().mockResolvedValue(null), setex: vi.fn() };
    (container as any).db = {
      config: { isDashboardEnabled: vi.fn().mockResolvedValue(true) },
      security: { getPanicState: vi.fn().mockResolvedValue(null) },
    };
    repositoryCache.clear();
    registerRpcHandlers();
  });

  afterEach(() => {
    resetDiscordBulkheadForTests();
  });

  it("queues the (N+1)th guildManager call behind the bulkhead's size, then admits it once a slot frees", async () => {
    resetDiscordBulkheadForTests(1, 10);
    const { get, resolve } = deferredGuildRest();

    const first = dispatchRpc({
      id: "req-1",
      action: "guild.panic.get",
      guildId: GUILD_ID,
      actorId: ACTOR_ID,
    });
    await new Promise((r) => setTimeout(r, 5));

    expect(await metricValue("lumi_semaphore_in_flight", { semaphore: "rpc-discord" })).toBe(1);

    const second = dispatchRpc({
      id: "req-2",
      action: "guild.panic.get",
      guildId: GUILD_ID,
      actorId: ACTOR_ID,
    });
    await new Promise((r) => setTimeout(r, 5));

    expect(await metricValue("lumi_semaphore_queued", { semaphore: "rpc-discord" })).toBe(1);
    expect(get).toHaveBeenCalledTimes(1);

    resolve();
    const [res1, res2] = await Promise.all([first, second]);

    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    expect(get).toHaveBeenCalledTimes(2);
    expect(await metricValue("lumi_semaphore_in_flight", { semaphore: "rpc-discord" })).toBe(0);
    expect(await metricValue("lumi_semaphore_queued", { semaphore: "rpc-discord" })).toBe(0);
  });

  it("rejects with a retryable error once the bulkhead's queue is full", async () => {
    resetDiscordBulkheadForTests(1, 1);
    deferredGuildRest();

    const inFlight = dispatchRpc({
      id: "req-a",
      action: "guild.panic.get",
      guildId: GUILD_ID,
      actorId: ACTOR_ID,
    });
    await new Promise((r) => setTimeout(r, 5));

    const queued = dispatchRpc({
      id: "req-b",
      action: "guild.panic.get",
      guildId: GUILD_ID,
      actorId: ACTOR_ID,
    });
    await new Promise((r) => setTimeout(r, 5));

    const rejected = await dispatchRpc({
      id: "req-c",
      action: "guild.panic.get",
      guildId: GUILD_ID,
      actorId: ACTOR_ID,
    });

    expect(rejected.ok).toBe(false);
    expect(rejected.retryable).toBe(true);

    // Drain the two admitted calls so the test doesn't leak a pending gate.
    void inFlight;
    void queued;
  });

  it("never routes a non-guildManager action through the bulkhead", async () => {
    resetDiscordBulkheadForTests(1, 0);
    container.client = {
      application: { owner: { id: ACTOR_ID } },
      guilds: { cache: new Map() },
      rest: { get: vi.fn().mockRejectedValue(new Error("should not be called")) },
    } as any;

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        dispatchRpc({ id: `whoami-${i}`, action: "auth.whoami", actorId: ACTOR_ID }),
      ),
    );

    for (const res of results) {
      expect(res.ok).toBe(true);
    }
  });
});

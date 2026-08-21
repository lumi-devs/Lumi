import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { container } from "@sapphire/framework";
import { ConfigRepository } from "#lib/prisma/repositories/ConfigRepository.js";
import { GuildKVRepository } from "#lib/prisma/repositories/GuildKVRepository.js";

vi.mock("@lumi/observability", () => ({
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
}));

function mockRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    set: vi.fn((k: string, v: string, ..._rest: unknown[]) => {
      if (store.has(k)) return Promise.resolve(null);
      store.set(k, v);
      return Promise.resolve("OK");
    }),
    setex: vi.fn((k: string, _ttl: number, v: string) => {
      store.set(k, v);
      return Promise.resolve("OK");
    }),
    eval: vi.fn((script: string, _numkeys: number, key: string) => {
      if (script.includes("DEL")) store.delete(key);
      return Promise.resolve(1);
    }),
  };
}

describe("ConfigRepository.mutateModuleConfig", () => {
  let redis: ReturnType<typeof mockRedis>;
  let prisma: any;
  let repo: ConfigRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    redis = mockRedis();
    (container as any).invalidation = {
      invalidate: vi.fn((...keys: string[]) => {
        for (const k of keys) redis.store.delete(k);
        return Promise.resolve();
      }),
    };
    prisma = {
      guildModuleConfig: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    repo = new ConfigRepository(prisma, redis as any, {} as any, {} as any);
  });

  it("reads the current value, applies the mutator, and persists the result", async () => {
    prisma.guildModuleConfig.findMany.mockResolvedValue([
      { configKey: "allowlist", value: ["a", "b"] },
    ]);

    const result = await repo.mutateModuleConfig<string[]>(
      "g1",
      "my-addon",
      "allowlist",
      (current) => [...(current ?? []), "c"],
    );

    expect(result).toEqual(["a", "b", "c"]);
    expect(prisma.guildModuleConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: ["a", "b", "c"] } }),
    );
  });

  it("deletes the key when the mutator returns undefined", async () => {
    await repo.mutateModuleConfig("g1", "my-addon", "allowlist", () => undefined);
    expect(prisma.guildModuleConfig.deleteMany).toHaveBeenCalled();
    expect(prisma.guildModuleConfig.upsert).not.toHaveBeenCalled();
  });

  it("serializes concurrent mutations on the same key via the Redis lock", async () => {
    let stored: number[] = [0];
    prisma.guildModuleConfig.findMany.mockImplementation(() =>
      Promise.resolve([{ configKey: "counter", value: stored }]),
    );
    prisma.guildModuleConfig.upsert.mockImplementation(({ update }: any) => {
      stored = update.value;
      return Promise.resolve({});
    });

    await Promise.all([
      repo.mutateModuleConfig<number[]>("g1", "my-addon", "counter", (c) => [...(c ?? []), 1]),
      repo.mutateModuleConfig<number[]>("g1", "my-addon", "counter", (c) => [...(c ?? []), 2]),
    ]);

    expect(stored).toHaveLength(3);
  });
});

describe("GuildKVRepository.mutateModuleData", () => {
  let redis: ReturnType<typeof mockRedis>;
  let prisma: any;
  let repo: GuildKVRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    redis = mockRedis();
    prisma = {
      moduleData: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    repo = new GuildKVRepository(prisma, redis as any, {} as any, {} as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("appends to an existing row atomically", async () => {
    prisma.moduleData.findUnique.mockResolvedValue({ value: ["x"] });

    const result = await repo.mutateModuleData<string[]>(
      "g1",
      "my-addon",
      "channel1",
      "watchlist",
      (current) => [...(current ?? []), "y"],
    );

    expect(result).toEqual(["x", "y"]);
    expect(prisma.moduleData.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: ["x", "y"] } }),
    );
  });

  it("initializes a missing row from null", async () => {
    const result = await repo.mutateModuleData<string[]>(
      "g1",
      "my-addon",
      "channel1",
      "watchlist",
      (current) => [...(current ?? []), "first"],
    );

    expect(result).toEqual(["first"]);
  });

  it("deletes the row when the mutator returns undefined", async () => {
    await repo.mutateModuleData("g1", "my-addon", "channel1", "watchlist", () => undefined);
    expect(prisma.moduleData.deleteMany).toHaveBeenCalled();
    expect(prisma.moduleData.upsert).not.toHaveBeenCalled();
  });
});

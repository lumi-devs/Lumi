import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { readyListener } from "#modules/core/listeners/ready.js";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("readyListener guild reconcile sweep", () => {
  const originalEnv = { ...process.env };
  let mockDb: any;
  let cachedGuildIds: string[];
  let shardIds: number[];

  function makeServices() {
    return {
      db: mockDb,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      moduleStore: { all: vi.fn().mockReturnValue([]) },
      client: {
        user: { tag: "Lumi#0000", fetch: vi.fn() },
        application: { fetch: vi.fn().mockResolvedValue(undefined) },
        guilds: { cache: { size: 0, keys: () => cachedGuildIds[Symbol.iterator]() } },
        shard: { ids: shardIds },
      },
    } as any;
  }

  beforeEach(() => {
    process.env.SHARD_COUNT = "2";

    mockDb = {
      publishBotStats: vi.fn().mockResolvedValue(undefined),
      findDepartedGuildIds: vi.fn().mockResolvedValue([]),
      findActiveGuildIds: vi.fn().mockResolvedValue([]),
      markGuildRejoined: vi.fn().mockResolvedValue(undefined),
      markGuildLeft: vi.fn().mockResolvedValue(undefined),
    };

    cachedGuildIds = [];
    shardIds = [0];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("clears leftAt for a cached guild that is marked departed in Postgres", async () => {
    cachedGuildIds = ["g-rejoined"];
    mockDb.findDepartedGuildIds.mockResolvedValue(["g-rejoined"]);

    readyListener.execute(makeServices());
    await flush();

    expect(mockDb.findDepartedGuildIds).toHaveBeenCalledWith(["g-rejoined"]);
    expect(mockDb.markGuildRejoined).toHaveBeenCalledWith("g-rejoined");
  });

  it("marks a guild left when it belongs to this shard, is active in Postgres, and is not in cache", async () => {
    // shardId = Number(BigInt(id) >> 22n) % shardCount; "0" -> shard 0, this
    // process's own shard.
    mockDb.findActiveGuildIds.mockResolvedValue(["0"]);

    readyListener.execute(makeServices());
    await flush();

    expect(mockDb.markGuildLeft).toHaveBeenCalledWith("0");
  });

  it("leaves a guild untouched when it belongs to a shard this process does not own", async () => {
    // "4194304" === 2^22, so shardId = Number(1n % 2n) = 1, not in [0].
    mockDb.findActiveGuildIds.mockResolvedValue(["4194304"]);

    readyListener.execute(makeServices());
    await flush();

    expect(mockDb.markGuildLeft).not.toHaveBeenCalled();
  });
});

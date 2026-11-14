import { describe, expect, it } from "vitest";
import { createCacheFacade } from "../src/cache.js";
import { createStatsHelpers } from "../src/helpers/stats.js";

type FacadeRedis = NonNullable<Parameters<typeof createCacheFacade>[0]>;
type StatsContext = Parameters<typeof createStatsHelpers>[0];

describe("createCacheFacade locks", () => {
  it("uses a CSPRNG token and atomic compare-and-delete release", async () => {
    const setCalls: unknown[][] = [];
    const evalCalls: unknown[][] = [];
    const redis = {
      set: async (...args: unknown[]) => {
        setCalls.push(args);
        return "OK";
      },
      eval: async (...args: unknown[]) => {
        evalCalls.push(args);
        return 1;
      },
    } as unknown as FacadeRedis;

    const release = await createCacheFacade(redis).takeLock("job", 1_000);
    expect(release).not.toBeNull();
    expect(setCalls[0]?.slice(0, 2)).toEqual([
      "lock:job",
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      ),
    ]);

    await release?.();
    expect(evalCalls).toHaveLength(1);
    expect(evalCalls[0]?.[0]).toContain("redis.call('get'");
    expect(evalCalls[0]?.slice(1, 3)).toEqual([1, "lock:job"]);
  });
});

describe("stats series allowlist", () => {
  it("rejects an untrusted filter column before querying", async () => {
    let queried = false;
    const context = {
      prisma: {
        $queryRaw: async () => {
          queried = true;
          return [];
        },
      },
      cache: {},
    } as unknown as StatsContext;

    const stats = createStatsHelpers(context);
    await expect(
      stats.messageSeries("guild", new Date(), 60, {
        column: "count) FROM stats_message_buckets --",
        value: "x",
      } as never),
    ).rejects.toThrow("Invalid stats series filter column");
    expect(queried).toBe(false);
  });
});

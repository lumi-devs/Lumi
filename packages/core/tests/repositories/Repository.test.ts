import { describe, it, expect, vi, beforeEach } from "vitest";
import { Repository } from "#lib/prisma/repositories/Repository.js";
import { container } from "@sapphire/framework";
import { cacheHits, cacheMisses } from "@lumi/observability";

vi.mock("@lumi/observability", () => ({
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
}));

class ConcreteRepository extends Repository {
  public callInvalidate(...keys: string[]) {
    return this.invalidate(...keys);
  }

  public callGetOrSet<T>(
    key: string,
    ttl: number,
    fetcher: () => Promise<T>,
    parser?: (data: string) => T
  ) {
    return this.getOrSet(key, ttl, fetcher, parser);
  }
}

describe("Base Repository", () => {
  let repo: ConcreteRepository;
  let mockPrisma: any;
  let mockRedis: any;
  let mockLogger: any;
  let mockDb: any;
  let mockInvalidation: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma = {};
    mockRedis = {
      get: vi.fn(),
      setex: vi.fn().mockResolvedValue("OK"),
    };
    mockLogger = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    mockDb = {};
    mockInvalidation = {
      invalidate: vi.fn().mockResolvedValue(undefined),
    };

    (container as any).invalidation = mockInvalidation;

    repo = new ConcreteRepository(mockPrisma, mockRedis, mockLogger, mockDb);
  });

  describe("invalidate", () => {
    it("calls container.invalidation.invalidate with provided keys", async () => {
      await repo.callInvalidate("key1", "key2");
      expect(mockInvalidation.invalidate).toHaveBeenCalledWith("key1", "key2");
    });
  });

  describe("getOrSet", () => {
    it("returns cached value on hit and increments cacheHits metric", async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ name: "cached" }));
      const fetcher = vi.fn();

      const result = await repo.callGetOrSet("prefix:mycache:1", 60, fetcher);

      expect(result).toEqual({ name: "cached" });
      expect(fetcher).not.toHaveBeenCalled();
      expect(cacheHits.inc).toHaveBeenCalledWith({ cache: "mycache" });
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it("uses custom parser when provided on cache hit", async () => {
      mockRedis.get.mockResolvedValue("12345");
      const fetcher = vi.fn();
      const customParser = (val: string) => parseInt(val, 10);

      const result = await repo.callGetOrSet("prefix:user:1", 60, fetcher, customParser);

      expect(result).toBe(12345);
      expect(cacheHits.inc).toHaveBeenCalledWith({ cache: "user" });
    });

    it("logs warning and falls back to fetcher when cached content is unparseable", async () => {
      mockRedis.get.mockResolvedValue("invalid-json{");
      const fetcher = vi.fn().mockResolvedValue({ name: "fresh" });

      const result = await repo.callGetOrSet("prefix:data:1", 60, fetcher);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "[cache] Unparseable entry for prefix:data:1, recomputing:",
        expect.any(SyntaxError)
      );
      expect(cacheMisses.inc).toHaveBeenCalledWith({ cache: "data" });
      expect(fetcher).toHaveBeenCalled();
      expect(mockRedis.setex).toHaveBeenCalledWith("prefix:data:1", 60, JSON.stringify({ name: "fresh" }));
      expect(result).toEqual({ name: "fresh" });
    });

    it("fetches data and sets cache on cache miss", async () => {
      mockRedis.get.mockResolvedValue(null);
      const fetcher = vi.fn().mockResolvedValue({ name: "fetched" });

      const result = await repo.callGetOrSet("prefix:session:10", 120, fetcher);

      expect(cacheMisses.inc).toHaveBeenCalledWith({ cache: "session" });
      expect(fetcher).toHaveBeenCalled();
      expect(mockRedis.setex).toHaveBeenCalledWith("prefix:session:10", 120, JSON.stringify({ name: "fetched" }));
      expect(result).toEqual({ name: "fetched" });
    });

    it("defaults cache name to 'unknown' when key has no colon delimiter", async () => {
      mockRedis.get.mockResolvedValue(null);
      const fetcher = vi.fn().mockResolvedValue("value");

      await repo.callGetOrSet("nocolonkey", 60, fetcher);

      expect(cacheMisses.inc).toHaveBeenCalledWith({ cache: "unknown" });
    });

    it("dedupes concurrent misses for the same key into one fetch", async () => {
      mockRedis.get.mockResolvedValue(null);
      let resolveFetch!: (v: string) => void;
      const fetcher = vi.fn().mockReturnValue(
        new Promise<string>((resolve) => {
          resolveFetch = resolve;
        })
      );

      const first = repo.callGetOrSet("prefix:flight:1", 60, fetcher);
      const second = repo.callGetOrSet("prefix:flight:1", 60, fetcher);
      resolveFetch("shared");

      await expect(first).resolves.toBe("shared");
      await expect(second).resolves.toBe("shared");
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("does not cache undefined fetcher results", async () => {
      mockRedis.get.mockResolvedValue(null);
      const fetcher = vi.fn().mockResolvedValue(undefined);

      const result = await repo.callGetOrSet("prefix:none:1", 60, fetcher);

      expect(result).toBeUndefined();
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it("skips repopulating the cache when a write invalidates the key mid-fetch", async () => {
      mockRedis.get
        .mockResolvedValueOnce(null) // main cache check: miss
        .mockResolvedValueOnce("111") // fence read before fetch
        .mockResolvedValueOnce("222"); // fence read after fetch - changed
      const fetcher = vi.fn().mockResolvedValue({ name: "stale-by-the-time-we-finish" });

      const result = await repo.callGetOrSet("prefix:mycache:1", 60, fetcher);

      expect(result).toEqual({ name: "stale-by-the-time-we-finish" });
      expect(mockRedis.setex).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "[cache] Skipped repopulating prefix:mycache:1 - invalidated while fetching",
      );
    });

    it("still repopulates the cache when the fence is unchanged across the fetch", async () => {
      mockRedis.get
        .mockResolvedValueOnce(null) // main cache check: miss
        .mockResolvedValueOnce("111") // fence read before fetch
        .mockResolvedValueOnce("111"); // fence read after fetch - unchanged
      const fetcher = vi.fn().mockResolvedValue({ name: "fresh" });

      const result = await repo.callGetOrSet("prefix:mycache:1", 60, fetcher);

      expect(result).toEqual({ name: "fresh" });
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "prefix:mycache:1",
        60,
        JSON.stringify({ name: "fresh" }),
      );
    });
  });
});

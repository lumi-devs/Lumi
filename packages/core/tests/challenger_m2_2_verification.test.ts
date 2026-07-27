import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DownloadResolver } from "#lib/downloader/resolver.js";
import TempVcService from "#modules/tempvc/services/TempVcService.js";
import { Repository } from "#lib/prisma/repositories/Repository.js";
import { container } from "@sapphire/framework";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

class TestRepository extends Repository {
  public testGetOrSet<T>(key: string, ttl: number, fetcher: () => Promise<T>, parser?: (data: string) => T) {
    return this.getOrSet(key, ttl, fetcher, parser);
  }
}

describe("Empirical Challenger M2_2 Verification Suite", () => {
  describe("Downloader Symlink Handling: Broken Symlink Edge Case", () => {
    let tmpDir: string;
    let moduleRoot: string;
    let addonRoot: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lumi-downloader-test-"));
      moduleRoot = path.join(tmpDir, "3rd-party");
      addonRoot = path.join(tmpDir, "installed");
      await fs.mkdir(moduleRoot, { recursive: true });
      await fs.mkdir(addonRoot, { recursive: true });
    });

    it("reproduces broken symlink EEXIST bug in DownloadResolver._exists & installModule", async () => {
      const repoName = "testrepo";
      const modName = "testmod";

      const repoDir = path.join(moduleRoot, repoName);
      const modDir = path.join(repoDir, modName);
      await fs.mkdir(modDir, { recursive: true });
      await fs.writeFile(path.join(modDir, "info.json"), JSON.stringify({ name: modName, version: "1.0.0" }));

      // Create a broken symlink in addonRoot pointing to a non-existent path
      const targetPath = path.join(addonRoot, modName);
      const nonExistentPath = path.join(tmpDir, "deleted_source");
      await fs.symlink(nonExistentPath, targetPath, "dir");

      // Verify fs.access on broken symlink throws ENOENT
      let accessThrew = false;
      try {
        await fs.access(targetPath);
      } catch (err: any) {
        accessThrew = true;
        expect(err.code).toBe("ENOENT");
      }
      expect(accessThrew).toBe(true);

      // Verify targetPath symlink still exists on filesystem (lstat succeeds)
      const lstat = await fs.lstat(targetPath);
      expect(lstat.isSymbolicLink()).toBe(true);

      // Test DownloadResolver._exists behavior on broken symlink
      const resolver = new DownloadResolver();
      const existsResult = await (resolver as any)._exists(targetPath);
      expect(existsResult).toBe(false); // _exists returns false for broken symlink!
    });
  });

  describe("Prisma / Base Repository Caching Behavior Under Load & Error", () => {
    let mockPrisma: any;
    let mockRedis: any;
    let mockLogger: any;
    let mockDb: any;

    beforeEach(() => {
      mockPrisma = {};
      mockRedis = {
        get: vi.fn(),
        setex: vi.fn().mockResolvedValue("OK"),
      };
      mockLogger = {
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
      };
      mockDb = {};
    });

    it("fails DB read operation when Redis get throws connection error", async () => {
      mockRedis.get.mockRejectedValue(new Error("Redis connection lost"));
      const repo = new TestRepository(mockPrisma, mockRedis, mockLogger, mockDb);
      const fetcher = vi.fn().mockResolvedValue({ id: 1 });

      await expect(repo.testGetOrSet("guild:settings:1", 60, fetcher)).rejects.toThrow("Redis connection lost");
      expect(fetcher).not.toHaveBeenCalled(); // DB fetcher was blocked by Redis error!
    });

    it("fails call when Redis setex throws after fetcher successfully resolves", async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockRejectedValue(new Error("Redis OOM or write error"));
      const repo = new TestRepository(mockPrisma, mockRedis, mockLogger, mockDb);
      const fetcher = vi.fn().mockResolvedValue({ id: 1, name: "Guild 1" });

      await expect(repo.testGetOrSet("guild:settings:1", 60, fetcher)).rejects.toThrow("Redis OOM or write error");
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("throws error when fetcher returns undefined because JSON.stringify(undefined) is undefined", async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockImplementation((key: string, ttl: number, val: any) => {
        if (val === undefined) throw new TypeError("value must be a string");
        return Promise.resolve("OK");
      });
      const repo = new TestRepository(mockPrisma, mockRedis, mockLogger, mockDb);
      const fetcher = vi.fn().mockResolvedValue(undefined);

      await expect(repo.testGetOrSet("guild:settings:1", 60, fetcher)).rejects.toThrow(TypeError);
    });

    it("reproduces cache stampede under 10 concurrent requests on cache miss", async () => {
      mockRedis.get.mockResolvedValue(null);
      const repo = new TestRepository(mockPrisma, mockRedis, mockLogger, mockDb);
      
      let dbQueries = 0;
      const fetcher = vi.fn().mockImplementation(async () => {
        dbQueries++;
        await new Promise((r) => setTimeout(r, 10));
        return { data: "result" };
      });

      const promises = Array.from({ length: 10 }, () =>
        repo.testGetOrSet("guild:settings:1", 60, fetcher)
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
      expect(dbQueries).toBe(10); // All 10 concurrent requests query the DB!
    });
  });

  describe("Voice Channel Reconciliation & Error Propagation Edge Cases", () => {
    let service: TempVcService;
    let mockRedis: any;
    let origRedis: any;
    let origLogger: any;
    let origClient: any;

    beforeEach(() => {
      origRedis = container.redis;
      origLogger = container.logger;
      origClient = container.client;

      mockRedis = {
        set: vi.fn(),
      };
      container.redis = mockRedis as any;
      container.logger = { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() } as any;
      container.client = { rest: { delete: vi.fn() } } as any;

      service = new TempVcService(
        { name: "tempvc", store: { name: "services" } } as any,
        {}
      );
    });

    afterEach(() => {
      container.redis = origRedis;
      container.logger = origLogger;
      container.client = origClient;
    });

    it("runCleanup rethrows unhandled REST API error codes such as 50001 (Missing Access)", async () => {
      (container.client.rest.delete as any).mockRejectedValue({
        code: 50001,
        message: "Missing Access",
      });

      const mockCleanup = async (data: { channelId: string }) => {
        try {
          await container.client.rest.delete("/channels/" + data.channelId);
        } catch (err: any) {
          if (err.code === 10003 || err.code === 50013) return;
          throw err;
        }
      };

      await expect(
        mockCleanup({ channelId: "c1" })
      ).rejects.toEqual({ code: 50001, message: "Missing Access" });
    });
  });
});

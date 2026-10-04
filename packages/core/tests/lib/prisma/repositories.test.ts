import { describe, it, expect, vi, beforeEach } from "bun:test";
import { DatabaseService } from "#lib/prisma/DatabaseService.js";
import { container } from "@sapphire/framework";
import { createMockPrismaClient } from "../../mocks/prisma.js";

vi.mock("@lumi/observability", () => ({
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
}));

describe("GdprExportJobRepository & GlobalRepository via DatabaseService", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let db: DatabaseService;
  let mockRedis: any;

  beforeEach(() => {
    prisma = createMockPrismaClient();
    const store = new Map<string, string>();
    mockRedis = {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, val: string) => {
        store.set(key, val);
        return "OK";
      }),
      setex: vi.fn(async (key: string, _ttl: number, val: string) => {
        store.set(key, val);
        return "OK";
      }),
      del: vi.fn(async (key: string) => {
        store.delete(key);
        return 1;
      }),
    };
    (container as any).redis = mockRedis;
    (container as any).invalidation = {
      invalidate: vi.fn(async (...keys: string[]) => {
        for (const k of keys) store.delete(k);
      }),
    };
    const mockLogger: any = { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() };
    db = new DatabaseService(prisma as any, mockRedis, mockLogger);
  });

  describe("GdprExportJobRepository", () => {
    it("creates and transitions job status through running, done, and failed", async () => {
      const job = await db.gdprExportJobs.create({
        userId: "user-1",
        requestedBy: "user-1",
      });

      expect(job.id).toBeDefined();
      expect(job.userId).toBe("user-1");

      await db.gdprExportJobs.markRunning(job.id);
      const runningJob = await db.gdprExportJobs.findById(job.id);
      expect(runningJob?.status).toBe("running");

      await db.gdprExportJobs.markDone(job.id, {
        filePath: "/tmp/export.gz",
        sizeBytes: 1024,
        expiresAt: new Date(Date.now() + 86400000),
      });

      const doneJob = await db.gdprExportJobs.findById(job.id);
      expect(doneJob?.status).toBe("done");
      expect(doneJob?.filePath).toBe("/tmp/export.gz");
      expect(doneJob?.sizeBytes).toBe(1024);

      await db.gdprExportJobs.markFailed(job.id, "Storage error");
      const failedJob = await db.gdprExportJobs.findById(job.id);
      expect(failedJob?.status).toBe("failed");
      expect(failedJob?.error).toBe("Storage error");
    });

    it("cleans up expired jobs", async () => {
      const expiredJob = await db.gdprExportJobs.create({ userId: "u-old", requestedBy: "u-old" });
      await db.gdprExportJobs.markDone(expiredJob.id, {
        filePath: "/tmp/old.gz",
        sizeBytes: 500,
        expiresAt: new Date(Date.now() - 10000),
      });

      const expiredList = await db.gdprExportJobs.findExpired(new Date());
      expect(expiredList.some((j) => j.id === expiredJob.id)).toBe(true);

      const deletedCount = await db.gdprExportJobs.deleteByIds([expiredJob.id]);
      expect(deletedCount).toBe(1);
    });
  });

  describe("GlobalRepository", () => {
    it("gets and updates global bot configuration with cache invalidation", async () => {
      const config = await db.global.getGlobalConfig();
      expect(config.id).toBe(1);

      await db.global.updateGlobalConfig({
        botName: "Lumi Pro",
        defaultPrefix: "?",
      });

      expect((container as any).invalidation.invalidate).toHaveBeenCalledWith(
        expect.any(String),
      );

      const maintenance = await db.global.setMaintenanceMode(true, "Maintenance in progress");
      expect(maintenance.maintenanceMode).toBe(true);
      expect(maintenance.maintenanceMessage).toBe("Maintenance in progress");
    });
  });
});

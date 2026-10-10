import { describe, it, expect, vi, beforeEach } from "bun:test";
import { FeatureFlagRepository } from "@lumi/lib/prisma/repositories/feature-flag-repository.js";
import { ValkeyKeys } from "@lumi/lib/valkey/client.js";
import { repositoryCache } from "@lumi/lib/cache/cache-store.js";
import { container } from "@lumi/lib/services.js";

vi.mock("@lumi/observability", () => ({
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
}));

describe("FeatureFlagRepository", () => {
  let repo: FeatureFlagRepository;
  let mockPrisma: any;
  let mockValkey: any;
  let mockInvalidation: any;

  beforeEach(() => {
    mockPrisma = {
      featureFlag: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockImplementation(({ create, update }) =>
          Promise.resolve({
            key: create.key,
            description: null,
            enabled: false,
            rolloutPercent: 0,
            updatedAt: new Date(),
            updatedBy: null,
            ...create,
            ...update,
          }),
        ),
      },
      featureFlagOverride: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockImplementation(({ create, update }) =>
          Promise.resolve({
            id: 1,
            createdAt: new Date(),
            ...create,
            ...update,
          }),
        ),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    mockValkey = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue("OK"),
    };

    mockInvalidation = { invalidate: vi.fn().mockResolvedValue(undefined) };

    (container as any).invalidation = mockInvalidation;
    (container as any).valkey = mockValkey;
    repositoryCache.clear();

    const mockDb: any = {};
    const mockLogger: any = { warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    repo = new FeatureFlagRepository(mockPrisma, mockValkey, mockLogger, mockDb);
  });

  describe("setFlag", () => {
    it("upserts by key and invalidates the evaluation cache", async () => {
      await repo.setFlag({
        key: "new-ui",
        description: "New UI rollout",
        enabled: true,
        rolloutPercent: 25,
        updatedBy: "owner-1",
      });

      expect(mockPrisma.featureFlag.upsert).toHaveBeenCalledWith({
        where: { key: "new-ui" },
        create: {
          key: "new-ui",
          description: "New UI rollout",
          enabled: true,
          rolloutPercent: 25,
          updatedBy: "owner-1",
        },
        update: {
          description: "New UI rollout",
          enabled: true,
          rolloutPercent: 25,
          updatedBy: "owner-1",
        },
      });
      expect(mockInvalidation.invalidate).toHaveBeenCalledWith(
        ValkeyKeys.featureFlagEval("new-ui"),
      );
    });

    it("leaves description untouched on update when omitted", async () => {
      await repo.setFlag({
        key: "new-ui",
        enabled: true,
        rolloutPercent: 10,
        updatedBy: "owner-1",
      });

      expect(mockPrisma.featureFlag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { enabled: true, rolloutPercent: 10, updatedBy: "owner-1" },
        }),
      );
    });
  });

  describe("getFlagForEvaluation", () => {
    it("caches a null result for an unknown key", async () => {
      await repo.getFlagForEvaluation("missing");
      await repo.getFlagForEvaluation("missing");

      expect(mockPrisma.featureFlag.findUnique).toHaveBeenCalledTimes(1);
    });

    it("returns the enabled/rolloutPercent projection", async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValue({
        enabled: true,
        rolloutPercent: 42,
      });

      const result = await repo.getFlagForEvaluation("flag");
      expect(result).toEqual({ enabled: true, rolloutPercent: 42 });
    });
  });

  describe("setOverride / deleteOverride", () => {
    it("upserts an override on the compound unique key and invalidates its cache", async () => {
      await repo.setOverride({ flagKey: "new-ui", guildId: "123", enabled: true });

      expect(mockPrisma.featureFlagOverride.upsert).toHaveBeenCalledWith({
        where: { uq_feature_flag_override: { flagKey: "new-ui", guildId: "123" } },
        create: { flagKey: "new-ui", guildId: "123", enabled: true },
        update: { enabled: true },
      });
      expect(mockInvalidation.invalidate).toHaveBeenCalledWith(
        ValkeyKeys.featureFlagOverride("new-ui", "123"),
      );
    });

    it("deletes an override and invalidates only when a row existed", async () => {
      mockPrisma.featureFlagOverride.deleteMany.mockResolvedValueOnce({ count: 0 });
      const deletedNothing = await repo.deleteOverride("new-ui", "123");
      expect(deletedNothing).toBe(false);
      expect(mockInvalidation.invalidate).not.toHaveBeenCalled();

      mockPrisma.featureFlagOverride.deleteMany.mockResolvedValueOnce({ count: 1 });
      const deleted = await repo.deleteOverride("new-ui", "123");
      expect(deleted).toBe(true);
      expect(mockInvalidation.invalidate).toHaveBeenCalledWith(
        ValkeyKeys.featureFlagOverride("new-ui", "123"),
      );
    });
  });

  describe("getOverride", () => {
    it("caches a null result when no override exists", async () => {
      await repo.getOverride("new-ui", "123");
      await repo.getOverride("new-ui", "123");

      expect(mockPrisma.featureFlagOverride.findUnique).toHaveBeenCalledTimes(1);
    });
  });
});

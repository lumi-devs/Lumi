import { describe, it, expect, vi, beforeEach } from "bun:test";
import { ConfigRepository } from "@lumi/lib/prisma/repositories/config-repository.js";
import { ValkeyKeys } from "@lumi/lib/valkey/client.js";
import { repositoryCache } from "@lumi/lib/cache/cache-store.js";
import { container } from "@lumi/lib/services.js";

vi.mock("@lumi/observability", () => ({
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
}));

describe("ConfigRepository", () => {
  let repo: ConfigRepository;
  let mockPrisma: any;
  let mockValkey: any;
  let mockConfigHistory: any;

  beforeEach(() => {
    mockPrisma = {
      guildModuleConfig: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockImplementation(({ create }) => Promise.resolve(create)),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn().mockImplementation((promises) => Promise.all(promises)),
    };

    mockValkey = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
    };

    mockConfigHistory = {
      logConfigChange: vi.fn().mockResolvedValue(undefined),
    };

    (container as any).invalidation = {
      invalidate: vi.fn().mockResolvedValue(undefined),
    };
    (container as any).valkey = mockValkey;
    repositoryCache.clear();

    const mockDb: any = {
      ensureGuild: vi.fn().mockResolvedValue(undefined),
    };

    const mockLogger: any = {
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    repo = new ConfigRepository(
      mockPrisma,
      mockValkey,
      mockLogger,
      mockDb,
      mockConfigHistory,
    );
  });

  describe("setModuleConfig", () => {
    it("upserts module config and invalidates cache without actorId", async () => {
      const result = await repo.setModuleConfig("123", "core", "test_key", "test_value");

      expect(mockPrisma.guildModuleConfig.upsert).toHaveBeenCalledWith({
        where: {
          guildId_moduleName_configKey: {
            guildId: "123",
            moduleName: "core",
            configKey: "test_key",
          },
        },
        update: { value: "test_value" },
        create: {
          guildId: "123",
          moduleName: "core",
          configKey: "test_key",
          value: "test_value",
        },
      });

      expect((container as any).invalidation.invalidate).toHaveBeenCalledWith(
        ValkeyKeys.guildConfig("core", "123"),
        ValkeyKeys.guildAllModuleConfigs("123"),
      );

      expect(mockConfigHistory.logConfigChange).not.toHaveBeenCalled();
      expect(result.value).toBe("test_value");
    });

    it("logs config change to history when actorId is provided", async () => {
      mockPrisma.guildModuleConfig.findMany.mockResolvedValue([
        { configKey: "test_key", value: "old_value" },
      ]);

      await repo.setModuleConfig("123", "core", "test_key", "new_value", "user_456");

      expect(mockConfigHistory.logConfigChange).toHaveBeenCalledWith({
        guildId: "123",
        moduleName: "core",
        key: "test_key",
        oldValue: "old_value",
        newValue: "new_value",
        actorId: "user_456",
      });
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConfigRepository } from "#lib/prisma/repositories/ConfigRepository.js";
import { RedisKeys } from "#lib/database/redis.js";
import { container } from "@sapphire/framework";

vi.mock("@lumi/observability", () => ({
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
}));

describe("ConfigRepository", () => {
  let repo: ConfigRepository;
  let mockPrisma: any;
  let mockRedis: any;
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

    mockRedis = {
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

    const mockDb: any = {
      configHistory: mockConfigHistory,
    };

    const mockLogger: any = {
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    repo = new ConfigRepository(mockPrisma, mockRedis, mockLogger, mockDb);
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
        RedisKeys.guildConfig("core", "123"),
        RedisKeys.guildAllModuleConfigs("123"),
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

  describe("setModuleConfigsMany", () => {
    it("upserts multiple keys in a transaction and logs history when actorId is given", async () => {
      mockPrisma.guildModuleConfig.findMany.mockResolvedValue([
        { configKey: "key1", value: "old1" },
      ]);

      await repo.setModuleConfigsMany(
        "123",
        "moderation",
        { key1: "val1", key2: "val2" },
        "actor_789",
      );

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect((container as any).invalidation.invalidate).toHaveBeenCalledWith(
        RedisKeys.guildConfig("moderation", "123"),
        RedisKeys.guildAllModuleConfigs("123"),
      );

      expect(mockConfigHistory.logConfigChange).toHaveBeenCalledWith({
        guildId: "123",
        moduleName: "moderation",
        key: "key1",
        oldValue: "old1",
        newValue: "val1",
        actorId: "actor_789",
      });

      expect(mockConfigHistory.logConfigChange).toHaveBeenCalledWith({
        guildId: "123",
        moduleName: "moderation",
        key: "key2",
        oldValue: null,
        newValue: "val2",
        actorId: "actor_789",
      });
    });
  });
});

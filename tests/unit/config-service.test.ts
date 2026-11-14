import type { NamespacedCache } from "@lumi/cache";
import type { InvalidationBus } from "@lumi/redis";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  ConfigService,
  type GuildSettings,
} from "../../src/admin/services/ConfigService.js";

describe("ConfigService", () => {
  it("invalidates cache and emits pub/sub on mutate", async () => {
    const mockPrisma = {
      $transaction: vi.fn().mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          guild: {
            findUnique: vi.fn().mockResolvedValue({ settings: { existing: true } }),
            upsert: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      }),
    } as unknown as PrismaClient;

    const mockCache = {
      delete: vi.fn().mockResolvedValue(undefined),
      getOrLoad: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
    } as unknown as NamespacedCache<GuildSettings>;

    const mockInvalidation = {
      invalidate: vi.fn().mockResolvedValue(undefined),
    } as unknown as InvalidationBus;

    const service = new ConfigService({
      prisma: mockPrisma,
      cache: mockCache,
      invalidation: mockInvalidation,
    });

    await service.set("123", "key", "value");

    expect(mockCache.delete).toHaveBeenCalledWith("123");
    expect(mockInvalidation.invalidate).toHaveBeenCalledWith("config", ["123"]);
  });

  it("loads from database when cache misses", async () => {
    const mockPrisma = {
      guild: {
        findUnique: vi.fn().mockResolvedValue({ settings: { foo: "bar" } }),
      },
    } as unknown as PrismaClient;

    const mockCache = {
      getOrLoad: vi.fn().mockImplementation(async (_key: string, _ttl: number, loader: () => Promise<unknown>) => {
        return loader();
      }),
    } as unknown as NamespacedCache<GuildSettings>;

    const service = new ConfigService({
      prisma: mockPrisma,
      cache: mockCache,
    });

    const result = await service.get("123", "foo");

    expect(result).toBe("bar");
    expect(mockPrisma.guild.findUnique).toHaveBeenCalledWith({
      where: { id: "123" },
      select: { settings: true },
    });
  });
});
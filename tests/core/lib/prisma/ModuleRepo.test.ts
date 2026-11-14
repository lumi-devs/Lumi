import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@lib/Services.js";
import { ModuleRepository } from "@db/repositories/ModuleRepository.js";
import { repositoryCache } from "@cache/CacheStore.js";
import { createMockPrismaClient } from "../../mocks/Prisma.js";
import { createMemoryRedis, type MemoryRedis } from "../../mocks/MemoryRedis.js";

vi.mock("@observability/Index.ts", () => ({
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
}));

describe("ModuleRepository", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let repo: ModuleRepository;
  let redis: MemoryRedis;

  beforeEach(() => {
    prisma = createMockPrismaClient();
    redis = createMemoryRedis();
    repositoryCache.clear();
    (container as any).redis = redis;
    (container as any).invalidation = {
      invalidate: vi.fn(async (...keys: string[]) => {
        for (const k of keys) {
          redis.$store.delete(k);
          repositoryCache.delete(k);
        }
      }),
    };
    const mockDb = { ensureGuild: vi.fn().mockResolvedValue(undefined) };
    const mockLogger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };
    repo = new ModuleRepository(prisma as any, redis as any, mockLogger as any, mockDb as any, prisma as any);
  });

  it("manages global module state overrides", async () => {
    await repo.setModuleGlobalEnabled("afk", false, "Under maintenance");

    const isGlobal = await repo.isModuleGlobalEnabled("afk");
    expect(isGlobal).toBe(false);

    const states = await repo.getGlobalModuleStates();
    expect(states.get("afk")).toBe(false);

    const detailed = await repo.getGlobalModuleStatesDetailed();
    expect(detailed).toContainEqual({
      moduleName: "afk",
      enabled: false,
      reason: "Under maintenance",
    });

    await repo.clearModuleGlobalState("afk");
    const restored = await repo.isModuleGlobalEnabled("afk");
    expect(restored).toBe(true);
  });

  it("manages per-guild module enablement", async () => {
    await repo.setModuleGuildEnabled("guild-1", "welcome", true);
    const isGuildEnabled = await repo.isModuleGuildEnabled("guild-1", "welcome");
    expect(isGuildEnabled).toBe(true);

    await repo.setModuleGuildEnabled("guild-1", "welcome", false);
    const isGuildDisabled = await repo.isModuleGuildEnabled("guild-1", "welcome");
    expect(isGuildDisabled).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import { ModuleRepository } from "#lib/prisma/repositories/ModuleRepository.js";
import { repositoryCache } from "#lib/prisma/repositories/Repository.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";

vi.mock("@lumi/observability", () => ({
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
}));

describe("ModuleRepository", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let repo: ModuleRepository;
  let mockRedis: any;
  let store: Map<string, string>;

  beforeEach(() => {
    prisma = createMockPrismaClient();
    store = new Map();
    repositoryCache.clear();
    mockRedis = {
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      set: vi.fn(async (k: string, v: string) => {
        store.set(k, v);
        return "OK";
      }),
      setex: vi.fn(async (k: string, _ttl: number, v: string) => {
        store.set(k, v);
        return "OK";
      }),
      del: vi.fn(async (k: string) => {
        store.delete(k);
        return 1;
      }),
    };
    (container as any).redis = mockRedis;
    (container as any).invalidation = {
      invalidate: vi.fn(async (...keys: string[]) => {
        for (const k of keys) {
          store.delete(k);
          repositoryCache.delete(k);
        }
      }),
    };
    const mockDb = { ensureGuild: vi.fn().mockResolvedValue(undefined) };
    const mockLogger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };
    repo = new ModuleRepository(prisma as any, mockRedis, mockLogger as any, mockDb as any, prisma as any);
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

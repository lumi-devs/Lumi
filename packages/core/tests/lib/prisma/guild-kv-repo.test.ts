import { describe, it, expect, vi, beforeEach } from "bun:test";
import { GuildKVRepository } from "#lib/prisma/repositories/GuildKVRepository.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";

vi.mock("@lumi/observability", () => ({
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
}));

describe("GuildKVRepository", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let repo: GuildKVRepository;
  let mockDb: any;

  beforeEach(() => {
    prisma = createMockPrismaClient();
    mockDb = { ensureGuild: vi.fn().mockResolvedValue(undefined) };
    const mockLogger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
    repo = new GuildKVRepository(prisma as any, {} as any, mockLogger as any, mockDb);
  });

  it("stores, retrieves, and checks single module data entries", async () => {
    await repo.setModuleData("guild-1", "custom-module", "user-1", "points", 150);

    const val = await repo.getModuleData<number>("guild-1", "custom-module", "user-1", "points");
    expect(val).toBe(150);

    const missing = await repo.getModuleData("guild-1", "custom-module", "user-1", "nonexistent");
    expect(missing).toBeNull();
  });

  it("retrieves multiple module data entries in a single query", async () => {
    await repo.setModuleData("guild-1", "test-mod", "user-1", "score", 10);
    await repo.setModuleData("guild-1", "test-mod", "user-2", "score", 20);

    const results = await repo.getModuleDataMany<number>("guild-1", "test-mod", [
      { targetId: "user-1", key: "score" },
      { targetId: "user-2", key: "score" },
      { targetId: "user-3", key: "score" },
    ]);

    expect(results.size).toBe(2);
    expect(results.get("user-1:score")).toBe(10);
    expect(results.get("user-2:score")).toBe(20);
    expect(results.has("user-3:score")).toBe(false);
  });

  it("deletes single and target module data keys", async () => {
    await repo.setModuleData("guild-1", "mod", "target-1", "k1", "v1");
    await repo.setModuleData("guild-1", "mod", "target-1", "k2", "v2");

    await repo.deleteModuleData("guild-1", "mod", "target-1", "k1");
    expect(await repo.getModuleData("guild-1", "mod", "target-1", "k1")).toBe(null);
    expect(await repo.getModuleData<string>("guild-1", "mod", "target-1", "k2")).toBe("v2");

    const deleted = await repo.deleteModuleDataForTarget("mod", "target-1");
    expect(deleted).toBeGreaterThanOrEqual(1);
    const afterDelete = await repo.getModuleData("guild-1", "mod", "target-1", "k2");
    expect(afterDelete).toBe(null);
  });

  it("lists module data for a target and for a guild", async () => {
    await repo.setModuleData("guild-1", "mod", "u1", "settingA", "alpha");
    await repo.setModuleData("guild-1", "mod", "u1", "settingB", "beta");

    const forTarget = await repo.listModuleDataForTarget("mod", "u1");
    expect(forTarget.length).toBe(2);
    expect(forTarget.some((e) => e.key === "settingA" && e.value === "alpha")).toBe(true);

    const paged = await repo.listGuildModuleData("guild-1", { moduleName: "mod", take: 10 });
    expect(paged.entries.length).toBeGreaterThan(0);
  });
});

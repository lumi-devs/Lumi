import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@lib/Services.js";
import { PermissionRepository } from "@db/repositories/PermissionRepository.js";
import { RedisKeys } from "@redis/Store.js";
import { createMockPrismaClient } from "../../mocks/Prisma.js";
import { createMemoryRedis } from "../../mocks/MemoryRedis.js";

vi.mock("@observability/Index.ts", () => ({
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
}));

describe("PermissionRepository", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let repo: PermissionRepository;
  let mockRedis: any;

  beforeEach(() => {
    prisma = createMockPrismaClient();
    (container as any).invalidation = {
      invalidate: vi.fn().mockResolvedValue(undefined),
    };
    mockRedis = createMemoryRedis();
    const mockDb = {
      ensureGuild: vi.fn().mockResolvedValue(undefined),
    };
    const mockLogger = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    repo = new PermissionRepository(prisma as any, mockRedis, mockLogger as any, mockDb as any);
  });

  it("ensureBuiltinPermits creates standard builtin permits for a guild", async () => {
    await repo.ensureBuiltinPermits("guild-1");
    const permits = await repo.listPermits("guild-1");
    expect(permits.length).toBeGreaterThan(0);
    const adminPermit = permits.find((p) => p.name === "Trusted Admin");
    expect(adminPermit).toBeDefined();
    expect(adminPermit?.builtin).toBe(true);
  });

  it("creates, renames, updates nodes and deletes custom permits", async () => {
    const created = await repo.createPermit(
      "guild-1",
      "Event Host",
      "custom",
      ["events.*"],
      "grant",
    );

    expect(created.id).toBeDefined();
    expect(created.name).toBe("Event Host");
    expect(created.nodes).toEqual(["events.*"]);

    const renamed = await repo.renamePermit("guild-1", created.id, "Senior Event Host");
    expect(renamed?.name).toBe("Senior Event Host");

    const updated = await repo.updatePermitNodes("guild-1", created.id, ["events.*", "giveaways.*"]);
    expect(updated?.nodes).toContain("giveaways.*");

    const fetched = await repo.getPermit("guild-1", created.id);
    expect(fetched?.name).toBe("Senior Event Host");

    await repo.deletePermit("guild-1", created.id);

    const missing = await repo.getPermit("guild-1", created.id);
    expect(missing).toBeNull();
  });

  it("assigns and unassigns permits to targets", async () => {
    const permit = await repo.createPermit(
      "guild-1",
      "DJ",
      "custom",
      ["music.*"],
      "grant",
    );

    const assigned = await repo.assignPermit("guild-1", permit.id, "role", "role-dj");
    expect(assigned).toBeDefined();

    const withAssignments = await repo.getPermit("guild-1", permit.id);
    expect(withAssignments).toBeDefined();

    const unassigned = await repo.unassignPermit("guild-1", permit.id, "role", "role-dj");
    expect(unassigned).toBeGreaterThan(0);
  });

  it("resolves permit chains with quarantine detection", async () => {
    mockRedis.$store.set(RedisKeys.quarantineState("guild-1", "user-bad"), "1");

    const result = await repo.getPermitChain("guild-1", "user-bad", [
      { targetType: "user", targetId: "user-bad" },
    ]);

    expect(result.isQuarantined).toBe(true);
    expect(result.tiers).toBeDefined();
  });
});

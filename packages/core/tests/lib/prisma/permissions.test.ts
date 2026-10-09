import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "#lib/services.js";
import { PermissionRepository } from "#lib/prisma/repositories/PermissionRepository.js";
import { ValkeyKeys } from "#lib/valkey/client.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";

vi.mock("@lumi/observability", () => ({
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
}));

describe("PermissionRepository", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let repo: PermissionRepository;
  let mockValkey: any;
  let store: Map<string, string>;

  beforeEach(() => {
    prisma = createMockPrismaClient();
    store = new Map();
    (container as any).invalidation = {
      invalidate: vi.fn().mockResolvedValue(undefined),
    };
    mockValkey = {
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      mget: vi.fn(async (...args: any[]) => {
        const keys = Array.isArray(args[0]) ? args[0] : args;
        return keys.map((k: string) => store.get(k) ?? null);
      }),
      set: vi.fn(async (k: string, v: string) => {
        store.set(k, v);
        return "OK";
      }),
      del: vi.fn(async (...keys: string[]) => {
        for (const k of keys) store.delete(k);
        return keys.length;
      }),
      pipeline: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        setex: vi.fn().mockReturnThis(),
        del: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      }),
    };
    const mockDb = {
      ensureGuild: vi.fn().mockResolvedValue(undefined),
    };
    const mockLogger = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    repo = new PermissionRepository(prisma as any, mockValkey, mockLogger as any, mockDb as any);
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
    store.set(ValkeyKeys.quarantineState("guild-1", "user-bad"), "1");

    const result = await repo.getPermitChain("guild-1", "user-bad", [
      { targetType: "user", targetId: "user-bad" },
    ]);

    expect(result.isQuarantined).toBe(true);
    expect(result.tiers).toBeDefined();
  });
});

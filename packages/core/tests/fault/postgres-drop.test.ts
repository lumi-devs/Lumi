import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConfigRepository } from "#lib/prisma/repositories/ConfigRepository.js";
import { ModerationRepository } from "#lib/prisma/repositories/ModerationRepository.js";

interface SimulatedDbState {
  isOnline: boolean;
  poolExhausted: boolean;
}

function createChaosPrisma() {
  const state: SimulatedDbState = {
    isOnline: true,
    poolExhausted: false,
  };

  const checkHealth = () => {
    if (!state.isOnline) {
      const err = new Error("Connection terminated unexpectedly / ECONNREFUSED");
      (err as any).code = "P1001";
      throw err;
    }
    if (state.poolExhausted) {
      const err = new Error("Timed out fetching a new connection from the connection pool");
      (err as any).code = "P2024";
      throw err;
    }
  };

  const mockGuilds = new Map<string, any>();
  const mockCases = new Map<number, any>();

  const prisma = {
    _state: state,
    guild: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        checkHealth();
        return mockGuilds.get(where.id) ?? null;
      }),
      upsert: vi.fn(async ({ where, create: _c, update: _u }: any) => {
        checkHealth();
        const existing = mockGuilds.get(where.id);
        const data = existing ? { ...existing, ..._u } : { id: where.id, ..._c };
        mockGuilds.set(where.id, data);
        return data;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        checkHealth();
        mockGuilds.delete(where.id);
        return { id: where.id };
      }),
    },
    guildCaseCounter: {
      upsert: vi.fn(async ({ where, create: _c, update: _u }: any) => {
        checkHealth();
        return { guildId: where.guildId, next: 2 };
      }),
      update: vi.fn(async () => {
        checkHealth();
      }),
    },
    moderationCase: {
      findFirst: vi.fn(async () => {
        checkHealth();
        return null;
      }),
      create: vi.fn(async ({ data }: any) => {
        checkHealth();
        const id = mockCases.size + 1;
        const entry = { id, ...data, createdAt: new Date() };
        mockCases.set(id, entry);
        return entry;
      }),
      findMany: vi.fn(async () => {
        checkHealth();
        return Array.from(mockCases.values());
      }),
      count: vi.fn(async () => {
        checkHealth();
        return mockCases.size;
      }),
    },
    $transaction: vi.fn(async (fnOrArray: any) => {
      checkHealth();
      if (typeof fnOrArray === "function") {
        return fnOrArray(prisma);
      }
      return Promise.all(fnOrArray);
    }),
    $queryRaw: vi.fn(async () => {
      checkHealth();
      return [{ 1: 1 }];
    }),
    simulateHardDrop: () => {
      state.isOnline = false;
    },
    simulateRecovery: () => {
      state.isOnline = true;
      state.poolExhausted = false;
    },
    simulatePoolExhaustion: () => {
      state.poolExhausted = true;
    },
  };

  return prisma;
}

describe("Chaos Suite: PostgreSQL Hard Drop & Pool Exhaustion", () => {
  let prisma: ReturnType<typeof createChaosPrisma>;
  let redis: any;
  let configRepo: ConfigRepository;
  let modRepo: ModerationRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = createChaosPrisma();
    redis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
    };
    configRepo = new ConfigRepository(prisma as any, redis as any, {} as any, {} as any);
    modRepo = new ModerationRepository(prisma as any, redis as any, {} as any, {} as any);
  });

  it("handles transient database drop gracefully without unhandled crashes", async () => {
    await configRepo.getGuildSettings("guild-drop-1");
    expect(prisma.guild.upsert).toHaveBeenCalledTimes(1);

    prisma.simulateHardDrop();

    await expect(configRepo.getGuildSettings("guild-drop-1")).rejects.toThrow(/ECONNREFUSED/);

    prisma.simulateRecovery();

    await expect(configRepo.getGuildSettings("guild-drop-1")).resolves.toBeDefined();
    expect(prisma.guild.upsert).toHaveBeenCalledTimes(3);
  });

  it("survives connection pool exhaustion timeout and resumes once pool capacity frees", async () => {
    prisma.simulatePoolExhaustion();

    await expect(
      modRepo.createModerationCase({
        guildId: "guild-drop-1",
        userId: "user-1",
        moderatorId: "mod-1",
        action: "Warn",
        reason: "Spamming",
      }),
    ).rejects.toThrow(/Timed out fetching a new connection/);

    prisma.simulateRecovery();

    const created = await modRepo.createModerationCase({
      guildId: "guild-drop-1",
      userId: "user-1",
      moderatorId: "mod-1",
      action: "Warn",
      reason: "Spamming",
    });
    expect(created.id).toBeDefined();
    expect(created.action).toBe("Warn");
  });

  it("ensures health check query rejects during database drop and passes after recovery", async () => {
    await expect(prisma.$queryRaw()).resolves.toEqual([{ 1: 1 }]);

    prisma.simulateHardDrop();
    await expect(prisma.$queryRaw()).rejects.toThrow(/ECONNREFUSED|P1001/);

    prisma.simulateRecovery();
    await expect(prisma.$queryRaw()).resolves.toEqual([{ 1: 1 }]);
  });
});

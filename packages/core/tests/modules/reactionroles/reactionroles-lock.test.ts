import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import ReactionRolesUtility, {
  ReactionRoleMenuLockedError,
} from "#modules/reactionroles/utilities/ReactionRolesUtility.js";
import { ReactionRoleRepository } from "#modules/reactionroles/data/ReactionRoleRepository.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";

function mockRedis() {
  const store = new Map<string, string>();
  return {
    store,
    set: vi.fn((k: string, v: string, ..._rest: unknown[]) => {
      if (store.has(k)) return Promise.resolve(null);
      store.set(k, v);
      return Promise.resolve("OK");
    }),
    eval: vi.fn((script: string, _numkeys: number, key: string, token?: string) => {
      const current = store.get(key);
      if (script.includes("DEL")) {
        if (current === token) {
          store.delete(key);
          return Promise.resolve(1);
        }
        return Promise.resolve(0);
      }
      return Promise.resolve(current === token ? 1 : 0);
    }),
  };
}

function installMockDb() {
  const prisma = createMockPrismaClient();
  const mockLogger = {
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  };
  const mockDb = { ensureGuild: vi.fn().mockResolvedValue(undefined) };
  (container as any).db = {
    ...mockDb,
    config: {
      getModuleConfig: vi.fn().mockResolvedValue(null),
    },
    reactionRoles: new ReactionRoleRepository(
      prisma as never,
      {} as never,
      mockLogger as never,
      mockDb as never,
    ),
  } as any;
  return prisma;
}

describe("ReactionRolesUtility menu-write locking", () => {
  let service: ReactionRolesUtility;
  let redis: ReturnType<typeof mockRedis>;

  beforeEach(() => {
    vi.clearAllMocks();
    redis = mockRedis();
    (container as any).redis = redis;
    (container as any).signals = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
    (container as any).logger = {
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
    };
    installMockDb();
    service = new ReactionRolesUtility(
      { name: "reactionroles", store: { name: "utilities" } } as any,
      {},
    );
  });

  it("serializes concurrent addOption calls so both options survive", async () => {
    await service.createMenu("guild-1", { title: "Game Night", mode: "buttons" });

    await Promise.all([
      service.addOption("guild-1", "game-night", {
        label: "Valorant",
        roleId: "111111111111111111",
      }),
      service.addOption("guild-1", "game-night", {
        label: "Minecraft",
        roleId: "222222222222222222",
      }),
    ]);

    const menu = await service.getMenu("guild-1", "game-night");
    expect(menu?.options.map((o) => o.roleId).sort()).toEqual([
      "111111111111111111",
      "222222222222222222",
    ]);
  });

  it("loses an update when two writers race directly against the repository without the lock", async () => {
    // Same race as the test above, but bypassing ReactionRolesUtility and calling
    // the underlying data.ts read-modify-write directly - proves the race is real
    // at the storage layer the lock guards, not an artifact of the utility mock.
    const { saveMenu, getMenu: rawGetMenu } = await import("#modules/reactionroles/data/reactionroles.js");
    await saveMenu({
      id: "unlocked",
      guildId: "guild-1",
      title: "Unlocked",
      description: null,
      color: null,
      mode: "buttons",
      exclusive: false,
      maxRoles: 1,
      channelId: null,
      messageIds: [],
      options: [],
      richContent: { blocks: [] },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Both writers read the same stale snapshot before either writes back -
    // the classic lost-update anomaly the per-menu lock exists to prevent.
    // (A `Promise.all` race is nondeterministic against the repository's
    // multi-statement delete-then-recreate write and can land on an
    // interleaving where both options survive instead of one being lost;
    // this reproduces the anomaly deterministically instead.)
    const base = (await rawGetMenu("guild-1", "unlocked"))!;
    const optionFor = (roleId: string) => ({
      id: roleId,
      label: roleId,
      emoji: null,
      description: null,
      roleId,
      requiredRoleId: null,
    });

    await saveMenu({ ...base, options: [...base.options, optionFor("111111111111111111")] });
    await saveMenu({ ...base, options: [...base.options, optionFor("222222222222222222")] });

    const after = await rawGetMenu("guild-1", "unlocked");
    expect(after?.options.map((o) => o.roleId)).toEqual(["222222222222222222"]);
  });

  it("throws ReactionRoleMenuLockedError when the lock can't be acquired in time", async () => {
    // bun:test has no setTimeout-queue virtualization (only a Date.now() mock),
    // so this can't fast-forward the lock's internal retry backoff — it just
    // waits for the real ~30s acquire timeout to elapse on its own.
    redis.store.set("lumi:reactionroles:write:guild-1:game-night", "someone-else");

    const pending = service.updateMenu("guild-1", "game-night", { title: "Renamed" });
    await expect(pending).rejects.toBeInstanceOf(ReactionRoleMenuLockedError);
  }, 35_000);

  it("releases the lock on a failed write so the next writer can proceed", async () => {
    await service.createMenu("guild-1", { title: "Game Night", mode: "buttons" });

    await expect(
      service.addOption("guild-1", "missing-menu", {
        label: "Valorant",
        roleId: "111111111111111111",
      }),
    ).rejects.toThrow("no longer exists");

    await expect(
      service.addOption("guild-1", "game-night", {
        label: "Valorant",
        roleId: "111111111111111111",
      }),
    ).resolves.toBeTruthy();
  });
});

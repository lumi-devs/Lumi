import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "#src/lib/Services.js";
import ReactionRolesUtility, {
  ReactionRoleMenuLockedError,
} from "#src/modules/reactionroles/utilities/ReactionRolesUtility.js";
import { ReactionRoleRepository } from "#src/modules/reactionroles/data/ReactionRoleRepository.js";
import { createMockPrismaClient } from "../../mocks/Prisma.js";

function mockValkey() {
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
  let service: typeof ReactionRolesUtility;
  let valkey: ReturnType<typeof mockValkey>;

  beforeEach(() => {
    vi.clearAllMocks();
    valkey = mockValkey();
    (container as any).valkey = valkey;
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
    service = ReactionRolesUtility;
  });

  it("serializes concurrent addOption calls so both options survive", async () => {
    await service.createMenu(container, "guild-1", { title: "Game Night", mode: "buttons" });

    await Promise.all([
      service.addOption(container, "guild-1", "game-night", {
        label: "Valorant",
        roleId: "111111111111111111",
      }),
      service.addOption(container, "guild-1", "game-night", {
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

    const { saveMenu, getMenu: rawGetMenu } = await import("#src/modules/reactionroles/data/Reactionroles.js");
    await saveMenu(container, {
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

    const base = (await rawGetMenu(container, "guild-1", "unlocked"))!;
    const optionFor = (roleId: string) => ({
      id: roleId,
      label: roleId,
      emoji: null,
      description: null,
      roleId,
      requiredRoleId: null,
    });

    await saveMenu(container, { ...base, options: [...base.options, optionFor("111111111111111111")] });
    await saveMenu(container, { ...base, options: [...base.options, optionFor("222222222222222222")] });

    const after = await rawGetMenu(container, "guild-1", "unlocked");
    expect(after?.options.map((o) => o.roleId)).toEqual(["222222222222222222"]);
  });

  it("throws ReactionRoleMenuLockedError when the lock can't be acquired in time", async () => {

    valkey.store.set("lumi:reactionroles:write:guild-1:game-night", "someone-else");

    const pending = service.updateMenu(container, "guild-1", "game-night", { title: "Renamed" });
    await expect(pending).rejects.toBeInstanceOf(ReactionRoleMenuLockedError);
  }, 35_000);

  it("releases the lock on a failed write so the next writer can proceed", async () => {
    await service.createMenu(container, "guild-1", { title: "Game Night", mode: "buttons" });

    await expect(
      service.addOption(container, "guild-1", "missing-menu", {
        label: "Valorant",
        roleId: "111111111111111111",
      }),
    ).rejects.toThrow("no longer exists");

    await expect(
      service.addOption(container, "guild-1", "game-night", {
        label: "Valorant",
        roleId: "111111111111111111",
      }),
    ).resolves.toBeTruthy();
  });
});

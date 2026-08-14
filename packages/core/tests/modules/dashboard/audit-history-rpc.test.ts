import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { RPC_ACTIONS } from "@lumi/contracts";
import { rpcHandlers } from "#lib/rpc/dispatch.js";
import { DashboardModule } from "#modules/dashboard/index.js";
import { AuditRepository } from "#lib/prisma/repositories/AuditRepository.js";
import { ConfigHistoryRepository } from "#lib/prisma/repositories/ConfigHistoryRepository.js";
import { ConfigOverrideRepository } from "#lib/prisma/repositories/ConfigOverrideRepository.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";

const GUILD_ID = "123456789012345678";
const OTHER_GUILD_ID = "999999999999999999";
const OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";
const CHANNEL_ID = "444444444444444444";

function makeAudit(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    guildId: GUILD_ID,
    userId: OWNER_ID,
    action: "config.set",
    platform: "web",
    details: { key: "prefix" },
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeHistory(overrides: Record<string, unknown> = {}) {
  return {
    id: "h1",
    guildId: GUILD_ID,
    moduleName: "mod",
    key: "logChannel",
    oldValue: "old",
    newValue: "new",
    actorId: OWNER_ID,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("dashboard module audit + history + override RPC handlers", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let guild: any;
  let config: { setConfig: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();

    prisma = createMockPrismaClient();

    guild = {
      id: GUILD_ID,
      ownerId: OWNER_ID,
      members: { fetch: vi.fn() },
    };

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    container.client = {
      guilds: { cache: new Map([[GUILD_ID, guild]]) },
    } as any;

    const db = {
      ensureGuild: vi.fn().mockResolvedValue(undefined),
      config: { deleteModuleConfigKey: vi.fn().mockResolvedValue(undefined) },
    } as any;
    db.audit = new AuditRepository(prisma as any, {} as any, container.logger, db);
    db.configHistory = new ConfigHistoryRepository(
      prisma as any,
      {} as any,
      container.logger,
      db,
    );
    db.configOverrides = new ConfigOverrideRepository(
      prisma as any,
      {} as any,
      container.logger,
      db,
    );
    (container as any).db = db;

    config = { setConfig: vi.fn().mockResolvedValue({ coerced: "old" }) };

    container.stores = {
      get: vi.fn((name: string) =>
        name === "services"
          ? { get: (key: string) => (key === "config" ? config : undefined) }
          : { loaded: () => [] },
      ),
    } as any;

    const mod = new DashboardModule({} as any, { name: "dashboard" });
    await mod.onLoad();
  });

  const handlerFor = (action: string) => {
    const handler = rpcHandlers.get(action);
    if (!handler) throw new Error(`${action} handler not registered`);
    return handler;
  };

  const call = (action: string, data?: unknown, actorId = OWNER_ID) =>
    handlerFor(action)({ id: "req", action, guildId: GUILD_ID, actorId, data });

  const denyPermissions = () =>
    guild.members.fetch.mockResolvedValue({
      permissions: { has: vi.fn().mockReturnValue(false) },
    });

  describe("guild.audit.list", () => {
    it("returns newest-first entries with a total and serialized dates", async () => {
      prisma.$seed("auditLedger", [
        makeAudit({ id: 1, createdAt: new Date("2026-01-01T00:00:00.000Z") }),
        makeAudit({ id: 2, createdAt: new Date("2026-01-02T00:00:00.000Z") }),
      ]);

      const res = (await call(RPC_ACTIONS.guildAuditList, {})) as any;

      expect(res.total).toBe(2);
      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(25);
      expect(res.entries.map((e: any) => e.id)).toEqual([2, 1]);
      expect(res.entries[0].createdAt).toBe("2026-01-02T00:00:00.000Z");
    });

    it("filters by actor, action substring and platform", async () => {
      prisma.$seed("auditLedger", [
        makeAudit({ id: 1, action: "config.set", platform: "web" }),
        makeAudit({ id: 2, action: "module.toggle", platform: "discord" }),
        makeAudit({ id: 3, action: "config.delete", userId: INTRUDER_ID }),
      ]);

      const byAction = (await call(RPC_ACTIONS.guildAuditList, {
        action: "config.",
      })) as any;
      expect(byAction.total).toBe(2);

      const byPlatform = (await call(RPC_ACTIONS.guildAuditList, {
        platform: "discord",
      })) as any;
      expect(byPlatform.total).toBe(1);

      const byUser = (await call(RPC_ACTIONS.guildAuditList, {
        userId: INTRUDER_ID,
      })) as any;
      expect(byUser.total).toBe(1);
      expect(byUser.entries[0].id).toBe(3);
    });

    it("paginates and reports the unpaginated total", async () => {
      prisma.$seed(
        "auditLedger",
        Array.from({ length: 5 }, (_, i) =>
          makeAudit({
            id: i + 1,
            createdAt: new Date(2026, 0, i + 1),
          }),
        ),
      );

      const res = (await call(RPC_ACTIONS.guildAuditList, {
        page: 2,
        pageSize: 2,
      })) as any;

      expect(res.total).toBe(5);
      expect(res.entries.map((e: any) => e.id)).toEqual([3, 2]);
    });

    it("excludes another guild's entries", async () => {
      prisma.$seed("auditLedger", [
        makeAudit({ id: 1 }),
        makeAudit({ id: 2, guildId: OTHER_GUILD_ID }),
      ]);

      const res = (await call(RPC_ACTIONS.guildAuditList, {})) as any;
      expect(res.total).toBe(1);
      expect(res.entries[0].id).toBe(1);
    });

    it("rejects an unknown platform and an oversized page", async () => {
      await expect(
        call(RPC_ACTIONS.guildAuditList, { platform: "carrier-pigeon" }),
      ).rejects.toThrow("Bad payload");
      await expect(
        call(RPC_ACTIONS.guildAuditList, { pageSize: 500 }),
      ).rejects.toThrow("Bad payload");
    });

    it("rejects an actor without ManageGuild", async () => {
      denyPermissions();

      await expect(
        call(RPC_ACTIONS.guildAuditList, {}, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
    });
  });

  describe("guild.history.list", () => {
    it("returns newest-first entries scoped to the guild", async () => {
      prisma.$seed("moduleConfigHistory", [
        makeHistory({ id: "h1", createdAt: new Date("2026-01-01T00:00:00.000Z") }),
        makeHistory({ id: "h2", createdAt: new Date("2026-01-02T00:00:00.000Z") }),
        makeHistory({ id: "h3", guildId: OTHER_GUILD_ID }),
      ]);

      const res = (await call(RPC_ACTIONS.guildHistoryList, {})) as any;

      expect(res.total).toBe(2);
      expect(res.entries.map((e: any) => e.id)).toEqual(["h2", "h1"]);
      expect(res.entries[0].createdAt).toBe("2026-01-02T00:00:00.000Z");
    });

    it("filters by module and key", async () => {
      prisma.$seed("moduleConfigHistory", [
        makeHistory({ id: "h1", moduleName: "mod", key: "logChannel" }),
        makeHistory({ id: "h2", moduleName: "afk", key: "enabled" }),
      ]);

      const res = (await call(RPC_ACTIONS.guildHistoryList, {
        moduleName: "afk",
      })) as any;

      expect(res.total).toBe(1);
      expect(res.entries[0].id).toBe("h2");
    });

    it("rejects an actor without ManageGuild", async () => {
      denyPermissions();

      await expect(
        call(RPC_ACTIONS.guildHistoryList, {}, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
    });
  });

  describe("guild.history.rollback", () => {
    it("re-applies the previous value through the config service", async () => {
      prisma.$seed("moduleConfigHistory", [makeHistory({ id: "h1" })]);

      const res = (await call(RPC_ACTIONS.guildHistoryRollback, {
        entryId: "h1",
      })) as any;

      expect(config.setConfig).toHaveBeenCalledWith(
        GUILD_ID,
        "mod",
        "logChannel",
        "old",
        OWNER_ID,
      );
      expect(res).toEqual({
        success: true,
        moduleName: "mod",
        key: "logChannel",
        value: "old",
      });
    });

    it("deletes the key when the change created it", async () => {
      prisma.$seed("moduleConfigHistory", [
        makeHistory({ id: "h1", oldValue: null }),
      ]);

      const res = (await call(RPC_ACTIONS.guildHistoryRollback, {
        entryId: "h1",
      })) as any;

      expect(container.db.config.deleteModuleConfigKey).toHaveBeenCalledWith(
        GUILD_ID,
        "mod",
        "logChannel",
      );
      expect(config.setConfig).not.toHaveBeenCalled();
      expect(res.value).toBeNull();
    });

    it("joins a list value back into the raw comma form the config service expects", async () => {
      prisma.$seed("moduleConfigHistory", [
        makeHistory({ id: "h1", oldValue: ["a", "b"] }),
      ]);

      await call(RPC_ACTIONS.guildHistoryRollback, { entryId: "h1" });

      expect(config.setConfig).toHaveBeenCalledWith(
        GUILD_ID,
        "mod",
        "logChannel",
        "a,b",
        OWNER_ID,
      );
    });

    it("will not roll back another guild's history entry", async () => {
      prisma.$seed("moduleConfigHistory", [
        makeHistory({ id: "h1", guildId: OTHER_GUILD_ID }),
      ]);

      await expect(
        call(RPC_ACTIONS.guildHistoryRollback, { entryId: "h1" }),
      ).rejects.toThrow("History entry h1 not found");
      expect(config.setConfig).not.toHaveBeenCalled();
    });

    it("rejects an actor without ManageGuild", async () => {
      denyPermissions();
      prisma.$seed("moduleConfigHistory", [makeHistory({ id: "h1" })]);

      await expect(
        call(RPC_ACTIONS.guildHistoryRollback, { entryId: "h1" }, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
      expect(config.setConfig).not.toHaveBeenCalled();
    });
  });

  describe("guild.overrides", () => {
    it("lists this guild's overrides and narrows by module", async () => {
      prisma.$seed("moduleConfigOverride", [
        {
          id: "o1",
          guildId: GUILD_ID,
          moduleName: "mod",
          key: "enabled",
          modelType: "channel",
          modelId: CHANNEL_ID,
          value: false,
        },
        {
          id: "o2",
          guildId: GUILD_ID,
          moduleName: "afk",
          key: "enabled",
          modelType: "role",
          modelId: CHANNEL_ID,
          value: true,
        },
        {
          id: "o3",
          guildId: OTHER_GUILD_ID,
          moduleName: "mod",
          key: "enabled",
          modelType: "channel",
          modelId: CHANNEL_ID,
          value: false,
        },
      ]);

      const all = (await call(RPC_ACTIONS.guildOverridesList, {})) as any;
      expect(all.overrides.map((o: any) => o.id)).toEqual(["o2", "o1"]);

      const scoped = (await call(RPC_ACTIONS.guildOverridesList, {
        moduleName: "mod",
      })) as any;
      expect(scoped.overrides).toHaveLength(1);
      expect(scoped.overrides[0].id).toBe("o1");
    });

    it("upserts an override", async () => {
      const res = (await call(RPC_ACTIONS.guildOverridesSet, {
        moduleName: "mod",
        key: "enabled",
        modelType: "channel",
        modelId: CHANNEL_ID,
        value: false,
      })) as any;

      expect(res).toEqual({ success: true, deleted: false });
      const rows = prisma.$all("moduleConfigOverride");
      expect(rows).toHaveLength(1);
      expect(rows[0]!["guildId"]).toBe(GUILD_ID);
      expect(rows[0]!["value"]).toBe(false);
    });

    it("deletes the override when value is null", async () => {
      prisma.$seed("moduleConfigOverride", [
        {
          id: "o1",
          guildId: GUILD_ID,
          moduleName: "mod",
          key: "enabled",
          modelType: "channel",
          modelId: CHANNEL_ID,
          value: false,
        },
      ]);

      const res = (await call(RPC_ACTIONS.guildOverridesSet, {
        moduleName: "mod",
        key: "enabled",
        modelType: "channel",
        modelId: CHANNEL_ID,
        value: null,
      })) as any;

      expect(res).toEqual({ success: true, deleted: true });
      expect(prisma.$all("moduleConfigOverride")).toHaveLength(0);
    });

    it("rejects an unknown model type", async () => {
      await expect(
        call(RPC_ACTIONS.guildOverridesSet, {
          moduleName: "mod",
          key: "enabled",
          modelType: "planet",
          modelId: CHANNEL_ID,
          value: false,
        }),
      ).rejects.toThrow("Bad payload");
    });

    it("rejects an actor without ManageGuild", async () => {
      denyPermissions();

      await expect(
        call(
          RPC_ACTIONS.guildOverridesSet,
          {
            moduleName: "mod",
            key: "enabled",
            modelType: "channel",
            modelId: CHANNEL_ID,
            value: false,
          },
          INTRUDER_ID,
        ),
      ).rejects.toThrow("Missing ManageGuild permission");
      expect(prisma.$all("moduleConfigOverride")).toHaveLength(0);
    });
  });
});

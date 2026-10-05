import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import type { RpcActionName } from "@lumi/contracts/rpc";
import { getRpcHandler, registerRpcHandlers } from "#lib/rpc/registry.js";
import { AuditRepository } from "#lib/prisma/repositories/AuditRepository.js";
import { ConfigHistoryRepository } from "#lib/prisma/repositories/ConfigHistoryRepository.js";
import { ConfigOverrideRepository } from "#lib/prisma/repositories/ConfigOverrideRepository.js";
import { repositoryCache } from "#lib/prisma/repositories/Repository.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";
import { FakeDiscordRestPort } from "#lib/discord/fake-rest-port.js";

const GUILD_ID = "123456789012345678";
const OTHER_GUILD_ID = "999999999999999999";
const OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";
const CHANNEL_ID = "444444444444444444";

function everyoneRole(permissions = "0") {
  return { id: GUILD_ID, permissions };
}

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
    id: 1,
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
  let discordRest: FakeDiscordRestPort;
  let config: { setConfig: ReturnType<typeof vi.fn> };

  /** Re-seeds `checkGuildManagerRest`'s guild/member lookups; the intruder holds `memberRoles` (none by default). */
  function seedGuildManager(memberRoles: string[] = []) {
    discordRest.seedGuild({ id: GUILD_ID, owner_id: OWNER_ID, roles: [everyoneRole()] } as any);
    discordRest.seedMember(GUILD_ID, { user: { id: INTRUDER_ID }, roles: memberRoles } as any);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    repositoryCache.clear();

    prisma = createMockPrismaClient();

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    discordRest = new FakeDiscordRestPort();
    seedGuildManager();
    (container as any).discordRest = discordRest;
    (container as any).valkey = { get: vi.fn().mockResolvedValue(null), setex: vi.fn() };

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
        name === "utilities"
          ? { get: (key: string) => (key === "config" ? config : undefined) }
          : { loaded: () => [] },
      ),
    } as any;

    registerRpcHandlers();
  });

  const handlerFor = (action: RpcActionName) => {
    const handler = getRpcHandler(action);
    if (!handler) throw new Error(`${action} handler not registered`);
    return handler;
  };

  const call = (action: RpcActionName, data?: unknown, actorId = OWNER_ID) =>
    handlerFor(action)({ id: "req", action, guildId: GUILD_ID, actorId, data });

  const denyPermissions = () => seedGuildManager([]);

  describe("guild.audit.list", () => {
    it("returns newest-first entries with a total and serialized dates", async () => {
      prisma.$seed("auditLedger", [
        makeAudit({ id: 1, createdAt: new Date("2026-01-01T00:00:00.000Z") }),
        makeAudit({ id: 2, createdAt: new Date("2026-01-02T00:00:00.000Z") }),
      ]);

      const res = (await call("guild.audit.list", {})) as any;

      expect(res.total).toBe(2);
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

      const byAction = (await call("guild.audit.list", {
        action: "config.",
      })) as any;
      expect(byAction.total).toBe(2);

      const byPlatform = (await call("guild.audit.list", {
        platform: "discord",
      })) as any;
      expect(byPlatform.total).toBe(1);

      const byUser = (await call("guild.audit.list", {
        userId: INTRUDER_ID,
      })) as any;
      expect(byUser.total).toBe(1);
      expect(byUser.entries[0].id).toBe(3);
    });

    it("pages via cursor and reports the exact total only on the first page", async () => {
      prisma.$seed(
        "auditLedger",
        Array.from({ length: 5 }, (_, i) =>
          makeAudit({
            id: i + 1,
            createdAt: new Date(2026, 0, i + 1),
          }),
        ),
      );

      const firstPage = (await call("guild.audit.list", { pageSize: 2 })) as any;
      expect(firstPage.total).toBe(5);
      expect(firstPage.entries.map((e: any) => e.id)).toEqual([5, 4]);
      expect(firstPage.nextCursor).not.toBeNull();

      const secondPage = (await call("guild.audit.list", {
        pageSize: 2,
        cursor: firstPage.nextCursor,
      })) as any;
      expect(secondPage.total).toBeUndefined();
      expect(secondPage.entries.map((e: any) => e.id)).toEqual([3, 2]);
    });

    it("excludes another guild's entries", async () => {
      prisma.$seed("auditLedger", [
        makeAudit({ id: 1 }),
        makeAudit({ id: 2, guildId: OTHER_GUILD_ID }),
      ]);

      const res = (await call("guild.audit.list", {})) as any;
      expect(res.total).toBe(1);
      expect(res.entries[0].id).toBe(1);
    });

    it("rejects an unknown platform and an oversized page", async () => {
      await expect(
        call("guild.audit.list", { platform: "carrier-pigeon" }),
      ).rejects.toThrow("Bad payload");
      await expect(
        call("guild.audit.list", { pageSize: 500 }),
      ).rejects.toThrow("Bad payload");
    });

    it("rejects an actor without ManageGuild", async () => {
      denyPermissions();

      await expect(
        call("guild.audit.list", {}, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
    });

    it("pages by cursor, omitting total and returning nextCursor", async () => {
      prisma.$seed(
        "auditLedger",
        Array.from({ length: 5 }, (_, i) =>
          makeAudit({ id: i + 1, createdAt: new Date(2026, 0, i + 1) }),
        ),
      );

      const first = (await call("guild.audit.list", { pageSize: 2 })) as any;
      expect(first.total).toBe(5);
      expect(first.nextCursor).toBeTruthy();
      expect(first.entries.map((e: any) => e.id)).toEqual([5, 4]);

      const second = (await call("guild.audit.list", {
        pageSize: 2,
        cursor: first.nextCursor,
      })) as any;
      expect(second.total).toBeUndefined();
      expect(second.entries.map((e: any) => e.id)).toEqual([3, 2]);

      const third = (await call("guild.audit.list", {
        pageSize: 2,
        cursor: second.nextCursor,
      })) as any;
      expect(third.entries.map((e: any) => e.id)).toEqual([1]);
      expect(third.nextCursor).toBeNull();
    });

    it("rejects an invalid cursor", async () => {
      await expect(
        call("guild.audit.list", { cursor: "not-a-real-cursor" }),
      ).rejects.toThrow("Invalid pagination cursor");
    });
  });

  describe("guild.history.list", () => {
    it("returns newest-first entries scoped to the guild", async () => {
      prisma.$seed("moduleConfigHistory", [
        makeHistory({ id: 1, createdAt: new Date("2026-01-01T00:00:00.000Z") }),
        makeHistory({ id: 2, createdAt: new Date("2026-01-02T00:00:00.000Z") }),
        makeHistory({ id: 3, guildId: OTHER_GUILD_ID }),
      ]);

      const res = (await call("guild.history.list", {})) as any;

      expect(res.total).toBe(2);
      expect(res.entries.map((e: any) => e.id)).toEqual([2, 1]);
      expect(res.entries[0].createdAt).toBe("2026-01-02T00:00:00.000Z");
    });

    it("filters by module and key", async () => {
      prisma.$seed("moduleConfigHistory", [
        makeHistory({ id: 1, moduleName: "mod", key: "logChannel" }),
        makeHistory({ id: 2, moduleName: "afk", key: "enabled" }),
      ]);

      const res = (await call("guild.history.list", {
        moduleName: "afk",
      })) as any;

      expect(res.total).toBe(1);
      expect(res.entries[0].id).toBe(2);
    });

    it("rejects an actor without ManageGuild", async () => {
      denyPermissions();

      await expect(
        call("guild.history.list", {}, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
    });

    it("pages by cursor, omitting total and returning nextCursor", async () => {
      prisma.$seed(
        "moduleConfigHistory",
        Array.from({ length: 3 }, (_, i) =>
          makeHistory({ id: i + 1, createdAt: new Date(2026, 0, i + 1) }),
        ),
      );

      const first = (await call("guild.history.list", { pageSize: 2 })) as any;
      expect(first.total).toBe(3);
      expect(first.entries.map((e: any) => e.id)).toEqual([3, 2]);
      expect(first.nextCursor).toBeTruthy();

      const second = (await call("guild.history.list", {
        pageSize: 2,
        cursor: first.nextCursor,
      })) as any;
      expect(second.total).toBeUndefined();
      expect(second.entries.map((e: any) => e.id)).toEqual([1]);
      expect(second.nextCursor).toBeNull();
    });

    it("rejects an invalid cursor", async () => {
      await expect(
        call("guild.history.list", { cursor: "not-a-real-cursor" }),
      ).rejects.toThrow("Invalid pagination cursor");
    });
  });

  describe("guild.history.rollback", () => {
    it("re-applies the previous value through the config service", async () => {
      prisma.$seed("moduleConfigHistory", [makeHistory({ id: 1 })]);

      const res = (await call("guild.history.rollback", {
        entryId: 1,
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
        makeHistory({ id: 1, oldValue: null }),
      ]);

      const res = (await call("guild.history.rollback", {
        entryId: 1,
      })) as any;

      expect(container.db.config.deleteModuleConfigKey).toHaveBeenCalledWith(
        GUILD_ID,
        "mod",
        "logChannel",
      );
      expect(config.setConfig).not.toHaveBeenCalled();
      expect(res.value).toBeNull();
    });

    it("passes a list value through as a typed array", async () => {
      prisma.$seed("moduleConfigHistory", [
        makeHistory({ id: 1, oldValue: ["a", "b"] }),
      ]);

      await call("guild.history.rollback", { entryId: 1 });

      expect(config.setConfig).toHaveBeenCalledWith(
        GUILD_ID,
        "mod",
        "logChannel",
        ["a", "b"],
        OWNER_ID,
      );
    });

    it("will not roll back another guild's history entry", async () => {
      prisma.$seed("moduleConfigHistory", [
        makeHistory({ id: 1, guildId: OTHER_GUILD_ID }),
      ]);

      await expect(
        call("guild.history.rollback", { entryId: 1 }),
      ).rejects.toThrow("History entry 1 not found");
      expect(config.setConfig).not.toHaveBeenCalled();
    });

    it("rejects an actor without ManageGuild", async () => {
      denyPermissions();
      prisma.$seed("moduleConfigHistory", [makeHistory({ id: 1 })]);

      await expect(
        call("guild.history.rollback", { entryId: 1 }, INTRUDER_ID),
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

      const all = (await call("guild.overrides.list", {})) as any;
      expect(all.overrides.map((o: any) => o.id)).toEqual(["o2", "o1"]);

      const scoped = (await call("guild.overrides.list", {
        moduleName: "mod",
      })) as any;
      expect(scoped.overrides).toHaveLength(1);
      expect(scoped.overrides[0].id).toBe("o1");
    });

    it("upserts an override", async () => {
      const res = (await call("guild.overrides.set", {
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

      const res = (await call("guild.overrides.set", {
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
        call("guild.overrides.set", {
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
          "guild.overrides.set",
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

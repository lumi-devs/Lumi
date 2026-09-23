import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import type { RpcActionName } from "@lumi/contracts/rpc";
import { getRpcHandler, registerRpcHandlers } from "#lib/rpc/registry.js";
import { AuditRepository } from "#lib/prisma/repositories/AuditRepository.js";
import { AccessRepository } from "#lib/prisma/repositories/AccessRepository.js";
import { createMockPrismaClient } from "../mocks/prisma.js";

const GUILD_ID = "123456789012345678";
const BOT_OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";
const TARGET_ID = "444444444444444444";

function makeAudit(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    guildId: GUILD_ID,
    userId: BOT_OWNER_ID,
    action: "config.set",
    platform: "web",
    details: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeBlock(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: TARGET_ID,
    guildId: GUILD_ID,
    reason: "spam",
    blockedBy: BOT_OWNER_ID,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeGlobalBlock(overrides: Record<string, unknown> = {}) {
  return {
    userId: TARGET_ID,
    reason: "spam",
    blockedBy: BOT_OWNER_ID,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("system panel RPC handlers", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = createMockPrismaClient();

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    // `PermitResolver.isBotOwner` falls back to the Discord application's
    // owner, which is what the dashboard's session flag is derived from.
    container.client = {
      application: { owner: { id: BOT_OWNER_ID } },
      guilds: { cache: new Map() },
    } as any;

    (container as any).invalidation = { invalidate: vi.fn() };

    const redis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn(),
      pipeline: vi.fn(() => ({ setex: vi.fn(), set: vi.fn(), exec: vi.fn() })),
    };

    const db = {} as any;
    db.audit = new AuditRepository(prisma as any, redis as any, container.logger, db);
    db.access = new AccessRepository(prisma as any, redis as any, container.logger, db);
    (container as any).db = db;

    registerRpcHandlers();
  });

  const handlerFor = (action: RpcActionName) => {
    const handler = getRpcHandler(action);
    if (!handler) throw new Error(`${action} handler not registered`);
    return handler;
  };

  const call = (action: RpcActionName, data?: unknown, actorId = BOT_OWNER_ID) =>
    handlerFor(action)({ id: "req", action, actorId, data });

  describe("system.audit.list", () => {
    it("reads the ledger across every guild", async () => {
      prisma.$seed("auditLedger", [
        makeAudit({ id: 1 }),
        makeAudit({ id: 2, guildId: "999999999999999999" }),
      ]);

      const res = (await call("system.audit.list", {})) as any;

      expect(res.total).toBe(2);
      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(25);
      expect(res.entries[0].createdAt).toBe("2026-01-01T00:00:00.000Z");
    });

    it("narrows to one guild when asked", async () => {
      prisma.$seed("auditLedger", [
        makeAudit({ id: 1 }),
        makeAudit({ id: 2, guildId: "999999999999999999" }),
      ]);

      const res = (await call("system.audit.list", {
        guildId: GUILD_ID,
      })) as any;

      expect(res.total).toBe(1);
      expect(res.entries[0].id).toBe(1);
    });

    it("paginates and reports the unpaginated total", async () => {
      prisma.$seed(
        "auditLedger",
        Array.from({ length: 5 }, (_, i) =>
          makeAudit({ id: i + 1, createdAt: new Date(2026, 0, i + 1) }),
        ),
      );

      const res = (await call("system.audit.list", {
        page: 2,
        pageSize: 2,
      })) as any;

      expect(res.total).toBe(5);
      expect(res.entries.map((e: any) => e.id)).toEqual([3, 2]);
    });

    it("rejects a non-owner", async () => {
      await expect(
        call("system.audit.list", {}, INTRUDER_ID),
      ).rejects.toThrow("Bot Owner authorization required");
    });

    it("rejects an oversized page", async () => {
      await expect(
        call("system.audit.list", { pageSize: 500 }),
      ).rejects.toThrow("Bad payload");
    });
  });

  describe("system.blocklist", () => {
    it("lists only global rows, newest first", async () => {
      prisma.$seed("globalBlock", [
        makeGlobalBlock({ createdAt: new Date("2026-01-01T00:00:00.000Z") }),
      ]);
      prisma.$seed("blocklist", [makeBlock({ id: 3, guildId: GUILD_ID })]);

      const res = (await call("system.blocklist.list", {})) as any;

      expect(res.total).toBe(1);
      expect(res.entries.map((e: any) => e.id)).toEqual([TARGET_ID]);
      expect(res.entries[0].blockedBy).toBe(BOT_OWNER_ID);
    });

    it("adds a global entry attributed to the acting owner", async () => {
      const res = (await call("system.blocklist.add", {
        userId: TARGET_ID,
        reason: "abuse",
      })) as any;

      expect(res).toEqual({ success: true, userId: TARGET_ID });
      const rows = prisma.$all("globalBlock");
      expect(rows).toHaveLength(1);
      expect(rows[0]!["blockedBy"]).toBe(BOT_OWNER_ID);
      expect(rows[0]!["reason"]).toBe("abuse");
      expect(prisma.$all("blocklist")).toHaveLength(0);
    });

    it("refuses to blocklist a bot owner", async () => {
      await expect(
        call("system.blocklist.add", { userId: BOT_OWNER_ID }),
      ).rejects.toThrow("Cannot blocklist a bot owner");
      expect(prisma.$all("globalBlock")).toHaveLength(0);
    });

    it("rejects a duplicate global entry", async () => {
      prisma.$seed("globalBlock", [makeGlobalBlock()]);

      await expect(
        call("system.blocklist.add", { userId: TARGET_ID }),
      ).rejects.toThrow("already blocklisted globally");
      expect(prisma.$all("globalBlock")).toHaveLength(1);
    });

    it("does not treat a guild-scoped row as a global one", async () => {
      prisma.$seed("blocklist", [makeBlock({ id: 1, guildId: GUILD_ID })]);

      await call("system.blocklist.add", { userId: TARGET_ID });

      expect(prisma.$all("blocklist")).toHaveLength(1);
      expect(prisma.$all("globalBlock")).toHaveLength(1);
    });

    it("removes only the global row", async () => {
      prisma.$seed("globalBlock", [makeGlobalBlock()]);
      prisma.$seed("blocklist", [makeBlock({ id: 2, guildId: GUILD_ID })]);

      const res = (await call("system.blocklist.remove", {
        userId: TARGET_ID,
      })) as any;

      expect(res).toEqual({ success: true, userId: TARGET_ID });
      expect(prisma.$all("globalBlock")).toHaveLength(0);
      const rows = prisma.$all("blocklist");
      expect(rows).toHaveLength(1);
      expect(rows[0]!["guildId"]).toBe(GUILD_ID);
    });

    it("rejects a non-owner on every entry point", async () => {
      await expect(
        call("system.blocklist.list", {}, INTRUDER_ID),
      ).rejects.toThrow("Bot Owner authorization required");
      await expect(
        call("system.blocklist.add", { userId: TARGET_ID }, INTRUDER_ID),
      ).rejects.toThrow("Bot Owner authorization required");
      await expect(
        call("system.blocklist.remove", { userId: TARGET_ID }, INTRUDER_ID),
      ).rejects.toThrow("Bot Owner authorization required");
      expect(prisma.$all("globalBlock")).toHaveLength(0);
    });

    it("rejects a malformed user id", async () => {
      await expect(
        call("system.blocklist.add", { userId: "not-a-snowflake" }),
      ).rejects.toThrow("Bad payload");
    });
  });

  describe("system.module.toggle", () => {
    it("calls moduleStore.setEnabled when available", async () => {
      const setEnabledSpy = vi.fn().mockResolvedValue(undefined);
      (container as any).stores = {
        get: vi.fn().mockReturnValue({
          setEnabled: setEnabledSpy,
        }),
      };

      const res = (await call("system.module.toggle", {
        moduleName: "mod",
        enabled: false,
        reason: "testing",
      })) as any;

      expect(res).toEqual({ success: true, moduleName: "mod", enabled: false });
      expect(setEnabledSpy).toHaveBeenCalledWith("mod", false, "testing");
    });

    it("throws when moduleStore is missing", async () => {
      (container as any).stores = {
        get: vi.fn().mockReturnValue(null),
      };

      await expect(
        call("system.module.toggle", {
          moduleName: "mod",
          enabled: true,
        }),
      ).rejects.toThrow("ModuleStore not initialized");
    });
  });
});

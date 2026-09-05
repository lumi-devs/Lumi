import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { RpcActions } from "@lumi/contracts";
import { rpcHandlers } from "#lib/rpc/dispatch.js";
import { initCoreRpcHandlers } from "#lib/rpc/core-rpc.js";
import { AuditRepository } from "#lib/prisma/repositories/AuditRepository.js";
import { AccessRepository } from "#lib/prisma/repositories/AccessRepository.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";

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
    guildId: null,
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

    initCoreRpcHandlers();
  });

  const handlerFor = (action: string) => {
    const handler = rpcHandlers.get(action);
    if (!handler) throw new Error(`${action} handler not registered`);
    return handler;
  };

  const call = (action: string, data?: unknown, actorId = BOT_OWNER_ID) =>
    handlerFor(action)({ id: "req", action, actorId, data });

  describe("system.audit.list", () => {
    it("reads the ledger across every guild", async () => {
      prisma.$seed("auditLedger", [
        makeAudit({ id: 1 }),
        makeAudit({ id: 2, guildId: "999999999999999999" }),
      ]);

      const res = (await call(RpcActions.systemAuditList, {})) as any;

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

      const res = (await call(RpcActions.systemAuditList, {
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

      const res = (await call(RpcActions.systemAuditList, {
        page: 2,
        pageSize: 2,
      })) as any;

      expect(res.total).toBe(5);
      expect(res.entries.map((e: any) => e.id)).toEqual([3, 2]);
    });

    it("rejects a non-owner", async () => {
      await expect(
        call(RpcActions.systemAuditList, {}, INTRUDER_ID),
      ).rejects.toThrow("Bot Owner authorization required");
    });

    it("rejects an oversized page", async () => {
      await expect(
        call(RpcActions.systemAuditList, { pageSize: 500 }),
      ).rejects.toThrow("Bad payload");
    });
  });

  describe("system.blocklist", () => {
    it("lists only global rows, newest first", async () => {
      prisma.$seed("blocklist", [
        makeBlock({ id: 1, createdAt: new Date("2026-01-01T00:00:00.000Z") }),
        makeBlock({ id: 2, createdAt: new Date("2026-01-02T00:00:00.000Z") }),
        makeBlock({ id: 3, guildId: GUILD_ID }),
      ]);

      const res = (await call(RpcActions.systemBlocklistList, {})) as any;

      expect(res.total).toBe(2);
      expect(res.entries.map((e: any) => e.id)).toEqual([2, 1]);
      expect(res.entries[0].blockedBy).toBe(BOT_OWNER_ID);
    });

    it("adds a global entry attributed to the acting owner", async () => {
      const res = (await call(RpcActions.systemBlocklistAdd, {
        userId: TARGET_ID,
        reason: "abuse",
      })) as any;

      expect(res).toEqual({ success: true, userId: TARGET_ID });
      const rows = prisma.$all("blocklist");
      expect(rows).toHaveLength(1);
      expect(rows[0]!["guildId"]).toBeNull();
      expect(rows[0]!["blockedBy"]).toBe(BOT_OWNER_ID);
      expect(rows[0]!["reason"]).toBe("abuse");
    });

    it("refuses to blocklist a bot owner", async () => {
      await expect(
        call(RpcActions.systemBlocklistAdd, { userId: BOT_OWNER_ID }),
      ).rejects.toThrow("Cannot blocklist a bot owner");
      expect(prisma.$all("blocklist")).toHaveLength(0);
    });

    it("rejects a duplicate global entry", async () => {
      prisma.$seed("blocklist", [makeBlock({ id: 1 })]);

      await expect(
        call(RpcActions.systemBlocklistAdd, { userId: TARGET_ID }),
      ).rejects.toThrow("already blocklisted globally");
      expect(prisma.$all("blocklist")).toHaveLength(1);
    });

    it("does not treat a guild-scoped row as a global one", async () => {
      prisma.$seed("blocklist", [makeBlock({ id: 1, guildId: GUILD_ID })]);

      await call(RpcActions.systemBlocklistAdd, { userId: TARGET_ID });

      expect(prisma.$all("blocklist")).toHaveLength(2);
    });

    it("removes only the global row", async () => {
      prisma.$seed("blocklist", [
        makeBlock({ id: 1 }),
        makeBlock({ id: 2, guildId: GUILD_ID }),
      ]);

      const res = (await call(RpcActions.systemBlocklistRemove, {
        userId: TARGET_ID,
      })) as any;

      expect(res).toEqual({ success: true, userId: TARGET_ID });
      const rows = prisma.$all("blocklist");
      expect(rows).toHaveLength(1);
      expect(rows[0]!["guildId"]).toBe(GUILD_ID);
    });

    it("rejects a non-owner on every entry point", async () => {
      await expect(
        call(RpcActions.systemBlocklistList, {}, INTRUDER_ID),
      ).rejects.toThrow("Bot Owner authorization required");
      await expect(
        call(RpcActions.systemBlocklistAdd, { userId: TARGET_ID }, INTRUDER_ID),
      ).rejects.toThrow("Bot Owner authorization required");
      await expect(
        call(
          RpcActions.systemBlocklistRemove,
          { userId: TARGET_ID },
          INTRUDER_ID,
        ),
      ).rejects.toThrow("Bot Owner authorization required");
      expect(prisma.$all("blocklist")).toHaveLength(0);
    });

    it("rejects a malformed user id", async () => {
      await expect(
        call(RpcActions.systemBlocklistAdd, { userId: "not-a-snowflake" }),
      ).rejects.toThrow("Bad payload");
    });
  });
});

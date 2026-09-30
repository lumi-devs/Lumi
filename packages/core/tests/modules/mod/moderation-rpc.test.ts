import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import type { RpcActionName } from "@lumi/contracts/rpc";
import { getRpcHandler, registerRpcHandlers } from "#lib/rpc/registry.js";
import { ModerationRepository } from "#lib/prisma/repositories/ModerationRepository.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";
import { repositoryCache } from "#lib/prisma/repositories/Repository.js";

const GUILD_ID = "123456789012345678";
const OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";
const TARGET_ID = "444444444444444444";
const MOD_ID = "555555555555555555";

function everyoneRole(permissions = "0") {
  return { id: GUILD_ID, permissions };
}

function memberWith(roleIds: string[]) {
  return { roles: roleIds };
}

function mockRest(opts: {
  guild?: { owner_id: string; roles: { id: string; permissions: string }[] } | null;
  member?: unknown;
  patch?: ReturnType<typeof vi.fn>;
  delete?: ReturnType<typeof vi.fn>;
}) {
  const get = vi.fn().mockImplementation((route: string) => {
    if (route === `/guilds/${GUILD_ID}`) {
      if (opts.guild === null || opts.guild === undefined) {
        return Promise.reject(new Error("Unknown Guild"));
      }
      return Promise.resolve({ id: GUILD_ID, ...opts.guild });
    }
    if (route.startsWith(`/guilds/${GUILD_ID}/members/`)) {
      if (opts.member === undefined) return Promise.reject(new Error("Unknown Member"));
      return Promise.resolve(opts.member);
    }
    return Promise.reject(new Error(`Unexpected route: ${route}`));
  });
  const patch = opts.patch ?? vi.fn().mockResolvedValue(undefined);
  const del = opts.delete ?? vi.fn().mockResolvedValue(undefined);
  return { rest: { get, patch, delete: del } };
}

function makeCase(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    guildId: GUILD_ID,
    caseNumber: 1,
    userId: TARGET_ID,
    moderatorId: MOD_ID,
    action: "warn",
    reason: "spam",
    duration: null,
    expiresAt: null,
    messageId: null,
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("mod module cases and warn-threshold RPC handlers", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = createMockPrismaClient();

    repositoryCache.clear();

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    container.client = mockRest({
      guild: { owner_id: OWNER_ID, roles: [everyoneRole()] },
      member: memberWith([]),
    }) as any;

    (container as any).redis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue(undefined),
      del: vi.fn(),
    } as any;

    (container as any).invalidation = {
      invalidate: vi.fn().mockResolvedValue(undefined),
    };

    const db: any = {
      ensureGuild: vi.fn().mockResolvedValue(undefined),
    };
    db.moderation = new ModerationRepository(
      prisma as any,
      {} as any,
      container.logger,
      db,
    );
    (container as any).db = db;

    container.stores = {
      get: vi.fn().mockReturnValue({ loaded: () => [] }),
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

  describe("guild.cases.list", () => {
    it("rejects an actor without ManageGuild", async () => {
      container.client = mockRest({
        guild: { owner_id: OWNER_ID, roles: [everyoneRole()] },
        member: memberWith([]),
      }) as any;

      await expect(
        call("guild.cases.list", {}, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
    });

    it("returns newest-first cases with a total and serialized dates", async () => {
      prisma.$seed("moderationCase", [
        makeCase({ id: 1, caseNumber: 1 }),
        makeCase({ id: 2, caseNumber: 2, action: "ban" }),
      ]);

      const res = (await call("guild.cases.list", {})) as any;

      expect(res.total).toBe(2);
      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(25);
      expect(res.cases.map((c: any) => c.caseNumber)).toEqual([2, 1]);
      expect(res.cases[0].createdAt).toBe("2026-01-01T00:00:00.000Z");
      expect(res.cases[0].expiresAt).toBeNull();
    });

    it("filters by action, target user and moderator", async () => {
      prisma.$seed("moderationCase", [
        makeCase({ id: 1, caseNumber: 1, action: "warn" }),
        makeCase({ id: 2, caseNumber: 2, action: "ban" }),
        makeCase({ id: 3, caseNumber: 3, action: "ban", userId: OWNER_ID }),
      ]);

      const byAction = (await call("guild.cases.list", {
        action: "ban",
      })) as any;
      expect(byAction.total).toBe(2);

      const byUser = (await call("guild.cases.list", {
        action: "ban",
        userId: TARGET_ID,
      })) as any;
      expect(byUser.total).toBe(1);
      expect(byUser.cases[0].caseNumber).toBe(2);

      const byModerator = (await call("guild.cases.list", {
        moderatorId: INTRUDER_ID,
      })) as any;
      expect(byModerator.total).toBe(0);
    });

    it("paginates and reports the unpaginated total", async () => {
      prisma.$seed(
        "moderationCase",
        Array.from({ length: 5 }, (_, i) =>
          makeCase({ id: i + 1, caseNumber: i + 1 }),
        ),
      );

      const res = (await call("guild.cases.list", {
        page: 2,
        pageSize: 2,
      })) as any;

      expect(res.total).toBe(5);
      expect(res.cases.map((c: any) => c.caseNumber)).toEqual([3, 2]);
    });

    it("excludes cases belonging to another guild", async () => {
      prisma.$seed("moderationCase", [
        makeCase({ id: 1, caseNumber: 1 }),
        makeCase({ id: 2, caseNumber: 2, guildId: "999999999999999999" }),
      ]);

      const res = (await call("guild.cases.list", {})) as any;
      expect(res.total).toBe(1);
      expect(res.cases[0].caseNumber).toBe(1);
    });

    it("rejects a pageSize above the cap", async () => {
      await expect(
        call("guild.cases.list", { pageSize: 500 }),
      ).rejects.toThrow("Bad payload");
    });
  });

  describe("guild.cases.revoke", () => {
    it("marks the case inactive", async () => {
      prisma.$seed("moderationCase", [makeCase({ id: 7, caseNumber: 3 })]);

      const res = (await call("guild.cases.revoke", {
        caseNumber: 3,
      })) as any;

      expect(res).toEqual({ success: true, caseNumber: 3 });
      expect(prisma.$all("moderationCase")[0]!["active"]).toBe(false);
    });

    it("throws for an unknown case number", async () => {
      await expect(
        call("guild.cases.revoke", { caseNumber: 42 }),
      ).rejects.toThrow("Case #42 not found");
    });

    it("throws when the case is already revoked", async () => {
      prisma.$seed("moderationCase", [
        makeCase({ id: 7, caseNumber: 3, active: false }),
      ]);

      await expect(
        call("guild.cases.revoke", { caseNumber: 3 }),
      ).rejects.toThrow("Case #3 is already revoked");
    });

    it("will not revoke a case owned by another guild", async () => {
      prisma.$seed("moderationCase", [
        makeCase({ id: 7, caseNumber: 3, guildId: "999999999999999999" }),
      ]);

      await expect(
        call("guild.cases.revoke", { caseNumber: 3 }),
      ).rejects.toThrow("Case #3 not found");
    });

    it("rejects an actor without ManageGuild", async () => {
      container.client = mockRest({
        guild: { owner_id: OWNER_ID, roles: [everyoneRole()] },
        member: memberWith([]),
      }) as any;
      prisma.$seed("moderationCase", [makeCase({ id: 7, caseNumber: 3 })]);

      await expect(
        call("guild.cases.revoke", { caseNumber: 3 }, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
      expect(prisma.$all("moderationCase")[0]!["active"]).toBe(true);
    });

    it("unbans on Discord before lifting a ban case", async () => {
      const del = vi.fn().mockResolvedValue(undefined);
      container.client = mockRest({
        guild: { owner_id: OWNER_ID, roles: [everyoneRole()] },
        member: memberWith([]),
        delete: del,
      }) as any;
      prisma.$seed("moderationCase", [makeCase({ id: 7, caseNumber: 3, action: "ban" })]);

      const res = (await call("guild.cases.revoke", { caseNumber: 3 })) as any;

      expect(res).toEqual({ success: true, caseNumber: 3 });
      expect(del).toHaveBeenCalledWith(
        expect.stringContaining(`/guilds/${GUILD_ID}/bans/${TARGET_ID}`),
        expect.anything(),
      );
      expect(prisma.$all("moderationCase")[0]!["active"]).toBe(false);
    });

    it("clears the timeout on Discord before lifting a mute case", async () => {
      const patch = vi.fn().mockResolvedValue(undefined);
      container.client = mockRest({
        guild: { owner_id: OWNER_ID, roles: [everyoneRole()] },
        member: memberWith([]),
        patch,
      }) as any;
      prisma.$seed("moderationCase", [makeCase({ id: 7, caseNumber: 3, action: "mute" })]);

      const res = (await call("guild.cases.revoke", { caseNumber: 3 })) as any;

      expect(res).toEqual({ success: true, caseNumber: 3 });
      expect(patch).toHaveBeenCalledWith(
        expect.stringContaining(`/guilds/${GUILD_ID}/members/${TARGET_ID}`),
        expect.objectContaining({ body: { communication_disabled_until: null } }),
      );
      expect(prisma.$all("moderationCase")[0]!["active"]).toBe(false);
    });

    it("clears the voice mute on Discord before lifting a voice_mute case", async () => {
      const patch = vi.fn().mockResolvedValue(undefined);
      container.client = mockRest({
        guild: { owner_id: OWNER_ID, roles: [everyoneRole()] },
        member: memberWith([]),
        patch,
      }) as any;
      prisma.$seed("moderationCase", [
        makeCase({ id: 7, caseNumber: 3, action: "voice_mute" }),
      ]);

      const res = (await call("guild.cases.revoke", { caseNumber: 3 })) as any;

      expect(res).toEqual({ success: true, caseNumber: 3 });
      expect(patch).toHaveBeenCalledWith(
        expect.stringContaining(`/guilds/${GUILD_ID}/members/${TARGET_ID}`),
        expect.objectContaining({ body: { mute: false } }),
      );
      expect(prisma.$all("moderationCase")[0]!["active"]).toBe(false);
    });

    it("still lifts a ban case when the user was already unbanned on Discord", async () => {
      const del = vi.fn().mockRejectedValue(Object.assign(new Error("Unknown Ban"), { code: 10026 }));
      container.client = mockRest({
        guild: { owner_id: OWNER_ID, roles: [everyoneRole()] },
        member: memberWith([]),
        delete: del,
      }) as any;
      prisma.$seed("moderationCase", [makeCase({ id: 7, caseNumber: 3, action: "ban" })]);

      const res = (await call("guild.cases.revoke", { caseNumber: 3 })) as any;

      expect(res).toEqual({ success: true, caseNumber: 3 });
      expect(prisma.$all("moderationCase")[0]!["active"]).toBe(false);
    });

    it("does not call Discord for a case with no Discord-side effect", async () => {
      const patch = vi.fn().mockResolvedValue(undefined);
      const del = vi.fn().mockResolvedValue(undefined);
      container.client = mockRest({
        guild: { owner_id: OWNER_ID, roles: [everyoneRole()] },
        member: memberWith([]),
        patch,
        delete: del,
      }) as any;
      prisma.$seed("moderationCase", [makeCase({ id: 7, caseNumber: 3, action: "warn" })]);

      const res = (await call("guild.cases.revoke", { caseNumber: 3 })) as any;

      expect(res).toEqual({ success: true, caseNumber: 3 });
      expect(patch).not.toHaveBeenCalled();
      expect(del).not.toHaveBeenCalled();
      expect(prisma.$all("moderationCase")[0]!["active"]).toBe(false);
    });

    it("surfaces a generic error and leaves the case active when the Discord undo fails", async () => {
      const del = vi.fn().mockRejectedValue(Object.assign(new Error("Missing Access"), { code: 50001 }));
      container.client = mockRest({
        guild: { owner_id: OWNER_ID, roles: [everyoneRole()] },
        member: memberWith([]),
        delete: del,
      }) as any;
      prisma.$seed("moderationCase", [makeCase({ id: 7, caseNumber: 3, action: "ban" })]);

      await expect(
        call("guild.cases.revoke", { caseNumber: 3 }),
      ).rejects.toThrow("Could not undo this action on Discord");
      expect(prisma.$all("moderationCase")[0]!["active"]).toBe(true);
    });

    it("surfaces a specific missing-permission error and leaves the case active on Discord 50013", async () => {
      const del = vi.fn().mockRejectedValue(Object.assign(new Error("Missing Permissions"), { code: 50013 }));
      container.client = mockRest({
        guild: { owner_id: OWNER_ID, roles: [everyoneRole()] },
        member: memberWith([]),
        delete: del,
      }) as any;
      prisma.$seed("moderationCase", [makeCase({ id: 7, caseNumber: 3, action: "ban" })]);

      await expect(
        call("guild.cases.revoke", { caseNumber: 3 }),
      ).rejects.toThrow("Lumi lacks permission to undo this on Discord");
      expect(prisma.$all("moderationCase")[0]!["active"]).toBe(true);
    });
  });

  describe("guild.warnThresholds.list", () => {
    it("returns this guild's rules ordered by warn count", async () => {
      prisma.$seed("warnThreshold", [
        { guildId: GUILD_ID, warnCount: 5, action: "ban", duration: null },
        { guildId: GUILD_ID, warnCount: 3, action: "mute", duration: 3600 },
        { guildId: "999999999999999999", warnCount: 1, action: "kick", duration: null },
      ]);

      const res = (await call("guild.warnThresholds.list")) as any;

      expect(res.thresholds).toEqual([
        { warnCount: 3, action: "mute", duration: "1h" },
        { warnCount: 5, action: "ban", duration: null },
      ]);
    });

    it("rejects an actor without ManageGuild", async () => {
      container.client = mockRest({
        guild: { owner_id: OWNER_ID, roles: [everyoneRole()] },
        member: memberWith([]),
      }) as any;

      await expect(
        call("guild.warnThresholds.list", undefined, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
    });
  });

  describe("guild.warnThresholds.set", () => {
    it("creates a rule", async () => {
      const res = (await call("guild.warnThresholds.set", {
        warnCount: 3,
        action: "mute",
        duration: "1h",
      })) as any;

      expect(res).toEqual({ success: true, warnCount: 3, deleted: false });
      expect(container.db.ensureGuild).toHaveBeenCalledWith(GUILD_ID);
      expect(prisma.$all("warnThreshold")).toHaveLength(1);
      expect(prisma.$all("warnThreshold")[0]!["action"]).toBe("mute");
    });

    it("updates an existing rule in place", async () => {
      prisma.$seed("warnThreshold", [
        { guildId: GUILD_ID, warnCount: 3, action: "mute", duration: 3600 },
      ]);

      await call("guild.warnThresholds.set", {
        warnCount: 3,
        action: "kick",
        duration: null,
      });

      const rows = prisma.$all("warnThreshold");
      expect(rows).toHaveLength(1);
      expect(rows[0]!["action"]).toBe("kick");
    });

    it("deletes the rule when action is null", async () => {
      prisma.$seed("warnThreshold", [
        { guildId: GUILD_ID, warnCount: 3, action: "mute", duration: 3600 },
        { guildId: GUILD_ID, warnCount: 5, action: "ban", duration: null },
      ]);

      const res = (await call("guild.warnThresholds.set", {
        warnCount: 3,
        action: null,
      })) as any;

      expect(res).toEqual({ success: true, warnCount: 3, deleted: true });
      const rows = prisma.$all("warnThreshold");
      expect(rows).toHaveLength(1);
      expect(rows[0]!["warnCount"]).toBe(5);
    });

    it("creates a quarantine rule and invalidates the cached ladder", async () => {
      const res = (await call("guild.warnThresholds.set", {
        warnCount: 4,
        action: "quarantine",
      })) as any;

      expect(res).toEqual({ success: true, warnCount: 4, deleted: false });
      expect(prisma.$all("warnThreshold")[0]!["action"]).toBe("quarantine");
      expect(container.invalidation.invalidate).toHaveBeenCalledWith(
        `lumi:mod:${GUILD_ID}:thresholds`,
      );
    });

    it("rejects a mute rule whose duration cannot be parsed", async () => {
      await expect(
        call("guild.warnThresholds.set", {
          warnCount: 3,
          action: "mute",
          duration: "whenever",
        }),
      ).rejects.toThrow(/whenever/);
      expect(prisma.$all("warnThreshold")).toHaveLength(0);
    });

    it("rejects an unknown escalation action", async () => {
      await expect(
        call("guild.warnThresholds.set", {
          warnCount: 3,
          action: "explode",
        }),
      ).rejects.toThrow("Bad payload");
    });

    it("rejects an actor without ManageGuild", async () => {
      container.client = mockRest({
        guild: { owner_id: OWNER_ID, roles: [everyoneRole()] },
        member: memberWith([]),
      }) as any;

      await expect(
        call("guild.warnThresholds.set", { warnCount: 3, action: "mute" }, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
      expect(prisma.$all("warnThreshold")).toHaveLength(0);
    });
  });
});

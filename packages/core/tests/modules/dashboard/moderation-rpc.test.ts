import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { RPC_ACTIONS } from "@lumi/contracts";
import { rpcHandlers } from "#lib/rpc/dispatch.js";
import { DashboardModule } from "#modules/dashboard/index.js";
import { ModerationRepository } from "#lib/prisma/repositories/ModerationRepository.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";

const GUILD_ID = "123456789012345678";
const OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";
const TARGET_ID = "444444444444444444";
const MOD_ID = "555555555555555555";

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

describe("dashboard module moderation RPC handlers", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let guild: any;

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

    (container as any).redis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn(),
      del: vi.fn(),
    } as any;

    (container as any).invalidation = {
      invalidate: vi.fn().mockResolvedValue(undefined),
    };

    (container as any).db = {
      moderation: new ModerationRepository(
        prisma as any,
        {} as any,
        container.logger,
        {} as any,
      ),
      ensureGuild: vi.fn().mockResolvedValue(undefined),
    };

    container.stores = {
      get: vi.fn().mockReturnValue({ loaded: () => [] }),
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

  describe("guild.cases.list", () => {
    it("rejects an actor without ManageGuild", async () => {
      guild.members.fetch.mockResolvedValue({
        permissions: { has: vi.fn().mockReturnValue(false) },
      });

      await expect(
        call(RPC_ACTIONS.guildCasesList, {}, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
    });

    it("returns newest-first cases with a total and serialized dates", async () => {
      prisma.$seed("moderationCase", [
        makeCase({ id: 1, caseNumber: 1 }),
        makeCase({ id: 2, caseNumber: 2, action: "ban" }),
      ]);

      const res = (await call(RPC_ACTIONS.guildCasesList, {})) as any;

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

      const byAction = (await call(RPC_ACTIONS.guildCasesList, {
        action: "ban",
      })) as any;
      expect(byAction.total).toBe(2);

      const byUser = (await call(RPC_ACTIONS.guildCasesList, {
        action: "ban",
        userId: TARGET_ID,
      })) as any;
      expect(byUser.total).toBe(1);
      expect(byUser.cases[0].caseNumber).toBe(2);

      const byModerator = (await call(RPC_ACTIONS.guildCasesList, {
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

      const res = (await call(RPC_ACTIONS.guildCasesList, {
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

      const res = (await call(RPC_ACTIONS.guildCasesList, {})) as any;
      expect(res.total).toBe(1);
      expect(res.cases[0].caseNumber).toBe(1);
    });

    it("rejects a pageSize above the cap", async () => {
      await expect(
        call(RPC_ACTIONS.guildCasesList, { pageSize: 500 }),
      ).rejects.toThrow("Bad payload");
    });
  });

  describe("guild.cases.revoke", () => {
    it("marks the case inactive", async () => {
      prisma.$seed("moderationCase", [makeCase({ id: 7, caseNumber: 3 })]);

      const res = (await call(RPC_ACTIONS.guildCasesRevoke, {
        caseNumber: 3,
      })) as any;

      expect(res).toEqual({ success: true, caseNumber: 3 });
      expect(prisma.$all("moderationCase")[0]!["active"]).toBe(false);
    });

    it("throws for an unknown case number", async () => {
      await expect(
        call(RPC_ACTIONS.guildCasesRevoke, { caseNumber: 42 }),
      ).rejects.toThrow("Case #42 not found");
    });

    it("throws when the case is already revoked", async () => {
      prisma.$seed("moderationCase", [
        makeCase({ id: 7, caseNumber: 3, active: false }),
      ]);

      await expect(
        call(RPC_ACTIONS.guildCasesRevoke, { caseNumber: 3 }),
      ).rejects.toThrow("Case #3 is already revoked");
    });

    it("will not revoke a case owned by another guild", async () => {
      prisma.$seed("moderationCase", [
        makeCase({ id: 7, caseNumber: 3, guildId: "999999999999999999" }),
      ]);

      await expect(
        call(RPC_ACTIONS.guildCasesRevoke, { caseNumber: 3 }),
      ).rejects.toThrow("Case #3 not found");
    });

    it("rejects an actor without ManageGuild", async () => {
      guild.members.fetch.mockResolvedValue({
        permissions: { has: vi.fn().mockReturnValue(false) },
      });
      prisma.$seed("moderationCase", [makeCase({ id: 7, caseNumber: 3 })]);

      await expect(
        call(RPC_ACTIONS.guildCasesRevoke, { caseNumber: 3 }, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
      expect(prisma.$all("moderationCase")[0]!["active"]).toBe(true);
    });
  });

  describe("guild.warnThresholds.list", () => {
    it("returns this guild's rules ordered by warn count", async () => {
      prisma.$seed("warnThreshold", [
        { guildId: GUILD_ID, warnCount: 5, action: "ban", duration: null },
        { guildId: GUILD_ID, warnCount: 3, action: "mute", duration: "1h" },
        { guildId: "999999999999999999", warnCount: 1, action: "kick", duration: null },
      ]);

      const res = (await call(RPC_ACTIONS.guildWarnThresholdsList)) as any;

      expect(res.thresholds).toEqual([
        { warnCount: 3, action: "mute", duration: "1h" },
        { warnCount: 5, action: "ban", duration: null },
      ]);
    });

    it("rejects an actor without ManageGuild", async () => {
      guild.members.fetch.mockResolvedValue({
        permissions: { has: vi.fn().mockReturnValue(false) },
      });

      await expect(
        call(RPC_ACTIONS.guildWarnThresholdsList, undefined, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
    });
  });

  describe("guild.warnThresholds.set", () => {
    it("creates a rule", async () => {
      const res = (await call(RPC_ACTIONS.guildWarnThresholdsSet, {
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
        { guildId: GUILD_ID, warnCount: 3, action: "mute", duration: "1h" },
      ]);

      await call(RPC_ACTIONS.guildWarnThresholdsSet, {
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
        { guildId: GUILD_ID, warnCount: 3, action: "mute", duration: "1h" },
        { guildId: GUILD_ID, warnCount: 5, action: "ban", duration: null },
      ]);

      const res = (await call(RPC_ACTIONS.guildWarnThresholdsSet, {
        warnCount: 3,
        action: null,
      })) as any;

      expect(res).toEqual({ success: true, warnCount: 3, deleted: true });
      const rows = prisma.$all("warnThreshold");
      expect(rows).toHaveLength(1);
      expect(rows[0]!["warnCount"]).toBe(5);
    });

    it("creates a quarantine rule and invalidates the cached ladder", async () => {
      const res = (await call(RPC_ACTIONS.guildWarnThresholdsSet, {
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
        call(RPC_ACTIONS.guildWarnThresholdsSet, {
          warnCount: 3,
          action: "mute",
          duration: "whenever",
        }),
      ).rejects.toThrow(/whenever/);
      expect(prisma.$all("warnThreshold")).toHaveLength(0);
    });

    it("rejects an unknown escalation action", async () => {
      await expect(
        call(RPC_ACTIONS.guildWarnThresholdsSet, {
          warnCount: 3,
          action: "explode",
        }),
      ).rejects.toThrow("Bad payload");
    });

    it("rejects an actor without ManageGuild", async () => {
      guild.members.fetch.mockResolvedValue({
        permissions: { has: vi.fn().mockReturnValue(false) },
      });

      await expect(
        call(
          RPC_ACTIONS.guildWarnThresholdsSet,
          { warnCount: 3, action: "mute" },
          INTRUDER_ID,
        ),
      ).rejects.toThrow("Missing ManageGuild permission");
      expect(prisma.$all("warnThreshold")).toHaveLength(0);
    });
  });
});

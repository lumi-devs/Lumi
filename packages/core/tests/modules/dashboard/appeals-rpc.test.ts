import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { container } from "@sapphire/framework";
import { RpcActions } from "@lumi/contracts";
import { rpcHandlers } from "#lib/rpc/dispatch.js";
import { DashboardModule } from "#modules/dashboard/index.js";
import { ModerationRepository } from "#lib/prisma/repositories/ModerationRepository.js";
import { AppealRepository } from "#lib/prisma/repositories/AppealRepository.js";
import { AccessRepository } from "#lib/prisma/repositories/AccessRepository.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";

const GUILD_ID = "123456789012345678";
const OTHER_GUILD_ID = "999999999999999999";
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
    action: "ban",
    reason: "spam",
    duration: null,
    expiresAt: null,
    messageId: null,
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("dashboard module appeals RPC handlers", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let guild: any;
  let generateAppealToken: (typeof import("#lib/appeals/token.js"))["generateAppealToken"];

  beforeAll(async () => {
    process.env["APPEAL_TOKEN_SECRET"] = "test-appeal-secret";
    ({ generateAppealToken } = await import("#lib/appeals/token.js"));
  });

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

    (container as any).invalidation = { invalidate: vi.fn() };

    const redis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn(),
      del: vi.fn(),
      pipeline: vi.fn(() => ({ setex: vi.fn(), set: vi.fn(), exec: vi.fn() })),
    } as any;

    const db: any = { ensureGuild: vi.fn().mockResolvedValue(undefined) };
    db.moderation = new ModerationRepository(prisma as any, redis, container.logger, db);
    db.appeals = new AppealRepository(prisma as any, redis, container.logger, db);
    db.access = new AccessRepository(prisma as any, redis, container.logger, db);
    (container as any).db = db;

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

  // Public handlers pass no actorId at all - that's the point.
  const callPublic = (action: string, data?: unknown) =>
    handlerFor(action)({ id: "req", action, guildId: GUILD_ID, data });

  const callAuthed = (action: string, data?: unknown, actorId = OWNER_ID) =>
    handlerFor(action)({ id: "req", action, guildId: GUILD_ID, actorId, data });

  const token = (overrides: Partial<{ guildId: string; caseId: number; userId: string }> = {}) =>
    generateAppealToken({ guildId: GUILD_ID, caseId: 1, userId: TARGET_ID, ...overrides });

  describe("guild.appeals.verify", () => {
    it("returns valid: true with the case summary for a well-formed token", async () => {
      prisma.$seed("moderationCase", [makeCase()]);

      const res = (await callPublic(RpcActions.guildAppealsVerify, {
        caseId: 1,
        token: token(),
      })) as any;

      expect(res.valid).toBe(true);
      expect(res.case).toEqual({
        caseNumber: 1,
        action: "ban",
        reason: "spam",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      expect(res.existingStatus).toBeNull();
    });

    it("reports an already-submitted appeal's status instead of a fresh one", async () => {
      prisma.$seed("moderationCase", [makeCase()]);
      prisma.$seed("appeal", [
        {
          id: 1,
          guildId: GUILD_ID,
          userId: TARGET_ID,
          caseId: 1,
          status: "pending",
          message: "please reconsider",
          reviewedBy: null,
          reviewedAt: null,
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      ]);

      const res = (await callPublic(RpcActions.guildAppealsVerify, {
        caseId: 1,
        token: token(),
      })) as any;

      expect(res.valid).toBe(true);
      expect(res.existingStatus).toBe("pending");
    });

    it("rejects a token whose signature doesn't match", async () => {
      prisma.$seed("moderationCase", [makeCase()]);

      const res = (await callPublic(RpcActions.guildAppealsVerify, {
        caseId: 1,
        token: `${token().split(".")[0]}.deadbeef`,
      })) as any;

      expect(res).toEqual({
        valid: false,
        reason: "This appeal link is invalid or has expired.",
      });
    });

    it("rejects a token minted for a different guild", async () => {
      prisma.$seed("moderationCase", [makeCase()]);

      const res = (await callPublic(RpcActions.guildAppealsVerify, {
        caseId: 1,
        token: token({ guildId: OTHER_GUILD_ID }),
      })) as any;

      expect(res.valid).toBe(false);
    });

    it("rejects a token minted for a different case id", async () => {
      prisma.$seed("moderationCase", [makeCase()]);

      const res = (await callPublic(RpcActions.guildAppealsVerify, {
        caseId: 1,
        token: token({ caseId: 2 }),
      })) as any;

      expect(res.valid).toBe(false);
    });

    it("rejects a token minted for a different user than the case's target", async () => {
      prisma.$seed("moderationCase", [makeCase()]);

      const res = (await callPublic(RpcActions.guildAppealsVerify, {
        caseId: 1,
        token: token({ userId: INTRUDER_ID }),
      })) as any;

      expect(res.valid).toBe(false);
    });

    it("rejects a case that belongs to another guild", async () => {
      prisma.$seed("moderationCase", [makeCase({ guildId: OTHER_GUILD_ID })]);

      const res = (await callPublic(RpcActions.guildAppealsVerify, {
        caseId: 1,
        token: token(),
      })) as any;

      expect(res.valid).toBe(false);
    });

    it("rejects a case action that isn't appealable", async () => {
      prisma.$seed("moderationCase", [makeCase({ action: "warn" })]);

      const res = (await callPublic(RpcActions.guildAppealsVerify, {
        caseId: 1,
        token: token(),
      })) as any;

      expect(res).toEqual({ valid: false, reason: "This case can't be appealed." });
    });

    it("rejects an unknown case id", async () => {
      const res = (await callPublic(RpcActions.guildAppealsVerify, {
        caseId: 404,
        token: token({ caseId: 404 }),
      })) as any;

      expect(res.valid).toBe(false);
    });
  });

  describe("guild.appeals.submit", () => {
    it("creates a pending appeal for a valid token", async () => {
      prisma.$seed("moderationCase", [makeCase()]);

      const res = (await callPublic(RpcActions.guildAppealsSubmit, {
        caseId: 1,
        token: token(),
        message: "I was not the one who sent those messages.",
      })) as any;

      expect(res.success).toBe(true);
      expect(res.appeal.status).toBe("pending");
      const rows = prisma.$all("appeal");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        guildId: GUILD_ID,
        userId: TARGET_ID,
        caseId: 1,
        message: "I was not the one who sent those messages.",
      });
    });

    it("rejects a second submission for the same case", async () => {
      prisma.$seed("moderationCase", [makeCase()]);
      prisma.$seed("appeal", [
        {
          id: 1,
          guildId: GUILD_ID,
          userId: TARGET_ID,
          caseId: 1,
          status: "pending",
          message: "first appeal",
          reviewedBy: null,
          reviewedAt: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ]);

      await expect(
        callPublic(RpcActions.guildAppealsSubmit, {
          caseId: 1,
          token: token(),
          message: "second attempt",
        }),
      ).rejects.toThrow("An appeal has already been submitted for this case.");
      expect(prisma.$all("appeal")).toHaveLength(1);
    });

    it("rejects an invalid token even if the case exists", async () => {
      prisma.$seed("moderationCase", [makeCase()]);

      await expect(
        callPublic(RpcActions.guildAppealsSubmit, {
          caseId: 1,
          token: "garbage",
          message: "please reconsider this decision",
        }),
      ).rejects.toThrow("This appeal link is invalid or has expired.");
      expect(prisma.$all("appeal")).toHaveLength(0);
    });
  });

  describe("guild.appeals.list", () => {
    it("rejects an actor without ManageGuild", async () => {
      guild.members.fetch.mockResolvedValue({
        permissions: { has: vi.fn().mockReturnValue(false) },
      });

      await expect(
        callAuthed(RpcActions.guildAppealsList, {}, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
    });

    it("joins in the case number and action, newest first", async () => {
      prisma.$seed("moderationCase", [
        makeCase({ id: 1, caseNumber: 1, action: "ban" }),
        makeCase({ id: 2, caseNumber: 5, action: "mute" }),
      ]);
      prisma.$seed("appeal", [
        {
          id: 1,
          guildId: GUILD_ID,
          userId: TARGET_ID,
          caseId: 1,
          status: "pending",
          message: "a",
          reviewedBy: null,
          reviewedAt: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          id: 2,
          guildId: GUILD_ID,
          userId: TARGET_ID,
          caseId: 2,
          status: "approved",
          message: "b",
          reviewedBy: OWNER_ID,
          reviewedAt: new Date("2026-01-03T00:00:00.000Z"),
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      ]);

      const res = (await callAuthed(RpcActions.guildAppealsList, {})) as any;

      expect(res.total).toBe(2);
      expect(res.appeals.map((a: any) => a.caseNumber)).toEqual([5, 1]);
      expect(res.appeals[0].action).toBe("mute");
      expect(res.appeals[0].status).toBe("approved");
      expect(res.appeals[0].reviewedAt).toBe("2026-01-03T00:00:00.000Z");
    });

    it("filters by status", async () => {
      prisma.$seed("moderationCase", [makeCase({ id: 1, caseNumber: 1 })]);
      prisma.$seed("appeal", [
        {
          id: 1,
          guildId: GUILD_ID,
          userId: TARGET_ID,
          caseId: 1,
          status: "dismissed",
          message: "a",
          reviewedBy: OWNER_ID,
          reviewedAt: new Date(),
          createdAt: new Date(),
        },
      ]);

      const res = (await callAuthed(RpcActions.guildAppealsList, {
        status: "pending",
      })) as any;

      expect(res.total).toBe(0);
    });
  });

  describe("guild.appeals.review", () => {
    function seedPendingAppeal() {
      prisma.$seed("moderationCase", [makeCase()]);
      prisma.$seed("appeal", [
        {
          id: 1,
          guildId: GUILD_ID,
          userId: TARGET_ID,
          caseId: 1,
          status: "pending",
          message: "please reconsider",
          reviewedBy: null,
          reviewedAt: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ]);
    }

    it("sets status, reviewedBy and reviewedAt", async () => {
      seedPendingAppeal();

      const res = (await callAuthed(RpcActions.guildAppealsReview, {
        id: 1,
        status: "approved",
      })) as any;

      expect(res.success).toBe(true);
      expect(res.appeal.status).toBe("approved");
      expect(res.appeal.reviewedBy).toBe(OWNER_ID);
      expect(res.appeal.reviewedAt).not.toBeNull();
      expect(prisma.$all("appeal")[0]).toMatchObject({
        status: "approved",
        reviewedBy: OWNER_ID,
      });
    });

    it("blacklists the appellant when denied_blacklisted", async () => {
      seedPendingAppeal();

      await callAuthed(RpcActions.guildAppealsReview, {
        id: 1,
        status: "denied_blacklisted",
      });

      const blocked = prisma.$all("blocklist");
      expect(blocked).toHaveLength(1);
      expect(blocked[0]).toMatchObject({ userId: TARGET_ID, guildId: GUILD_ID });
    });

    it("does not double-blacklist an already-blocklisted appellant", async () => {
      seedPendingAppeal();
      prisma.$seed("blocklist", [
        { id: 1, userId: TARGET_ID, guildId: GUILD_ID, reason: "prior", blockedBy: OWNER_ID, createdAt: new Date() },
      ]);

      await callAuthed(RpcActions.guildAppealsReview, {
        id: 1,
        status: "denied_blacklisted",
      });

      expect(prisma.$all("blocklist")).toHaveLength(1);
    });

    it("throws for an unknown appeal id", async () => {
      await expect(
        callAuthed(RpcActions.guildAppealsReview, { id: 42, status: "approved" }),
      ).rejects.toThrow("Appeal #42 not found");
    });

    it("will not review an appeal owned by another guild", async () => {
      prisma.$seed("moderationCase", [makeCase({ guildId: OTHER_GUILD_ID })]);
      prisma.$seed("appeal", [
        {
          id: 1,
          guildId: OTHER_GUILD_ID,
          userId: TARGET_ID,
          caseId: 1,
          status: "pending",
          message: "x",
          reviewedBy: null,
          reviewedAt: null,
          createdAt: new Date(),
        },
      ]);

      await expect(
        callAuthed(RpcActions.guildAppealsReview, { id: 1, status: "approved" }),
      ).rejects.toThrow("Appeal #1 not found");
    });

    it("rejects an actor without ManageGuild", async () => {
      seedPendingAppeal();
      guild.members.fetch.mockResolvedValue({
        permissions: { has: vi.fn().mockReturnValue(false) },
      });

      await expect(
        callAuthed(RpcActions.guildAppealsReview, { id: 1, status: "approved" }, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
      expect(prisma.$all("appeal")[0]!["status"]).toBe("pending");
    });
  });
});

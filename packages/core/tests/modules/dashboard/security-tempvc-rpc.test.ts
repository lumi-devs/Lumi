import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { RpcActions } from "@lumi/contracts";
import { rpcHandlers } from "#lib/rpc/dispatch.js";
import { DashboardModule } from "#modules/dashboard/index.js";
import { SecurityRepository } from "#lib/prisma/repositories/SecurityRepository.js";
import { TempVcRepository } from "#lib/prisma/repositories/TempVcRepository.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";

const GUILD_ID = "123456789012345678";
const OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";
const CHANNEL_ID = "444444444444444444";
const MESSAGE_ID = "555555555555555555";

describe("dashboard module security + tempvc RPC handlers", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let guild: any;
  let utilities: Map<string, unknown>;
  let security: { enterPanic: ReturnType<typeof vi.fn>; revertPanic: ReturnType<typeof vi.fn> };
  let tempvc: { addGenerator: ReturnType<typeof vi.fn>; removeGenerator: ReturnType<typeof vi.fn> };

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
    } as any;
    db.security = new SecurityRepository(prisma as any, {} as any, container.logger, db);
    db.tempvc = new TempVcRepository(prisma as any, {} as any, container.logger, db);
    (container as any).db = db;

    security = {
      enterPanic: vi
        .fn()
        .mockResolvedValue({ invitesPaused: true, lockedCount: 3, skippedCount: 0 }),
      revertPanic: vi.fn().mockResolvedValue({ restoredCount: 3 }),
    };
    tempvc = {
      addGenerator: vi.fn().mockResolvedValue(undefined),
      removeGenerator: vi.fn().mockResolvedValue(true),
    };

    utilities = new Map<string, unknown>([
      ["security", security],
      ["tempvc", tempvc],
    ]);

    container.stores = {
      get: vi.fn((name: string) =>
        name === "utilities"
          ? { get: (key: string) => utilities.get(key) }
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

  describe("guild.panic.get", () => {
    it("reports an inactive guild with no panic row", async () => {
      const res = (await call(RpcActions.guildPanicGet)) as any;

      expect(res).toEqual({
        active: false,
        actorId: null,
        invitesPaused: false,
        lockedChannelIds: [],
        startedAt: null,
      });
    });

    it("projects the stored snapshot", async () => {
      prisma.$seed("panicState", [
        {
          guildId: GUILD_ID,
          actorId: OWNER_ID,
          invitesPaused: true,
          lockedChannels: { [CHANNEL_ID]: null, [MESSAGE_ID]: false },
          startedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ]);

      const res = (await call(RpcActions.guildPanicGet)) as any;

      expect(res.active).toBe(true);
      expect(res.invitesPaused).toBe(true);
      expect(res.lockedChannelIds).toEqual([CHANNEL_ID, MESSAGE_ID]);
      expect(res.startedAt).toBe("2026-01-01T00:00:00.000Z");
    });

    it("rejects an actor without ManageGuild", async () => {
      denyPermissions();

      await expect(
        call(RpcActions.guildPanicGet, undefined, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
    });
  });

  describe("guild.panic.set", () => {
    it("enters panic through the security service", async () => {
      const res = (await call(RpcActions.guildPanicSet, {
        active: true,
        channelIds: [CHANNEL_ID],
      })) as any;

      expect(security.enterPanic).toHaveBeenCalledWith(guild, OWNER_ID, [
        CHANNEL_ID,
      ]);
      expect(res).toEqual({
        success: true,
        active: true,
        invitesPaused: true,
        lockedCount: 3,
        skippedCount: 0,
      });
    });

    it("refuses to re-enter panic while a snapshot exists", async () => {
      prisma.$seed("panicState", [
        {
          guildId: GUILD_ID,
          actorId: OWNER_ID,
          invitesPaused: true,
          lockedChannels: {},
          startedAt: new Date(),
        },
      ]);

      await expect(
        call(RpcActions.guildPanicSet, { active: true }),
      ).rejects.toThrow("Panic mode is already active");
      expect(security.enterPanic).not.toHaveBeenCalled();
    });

    it("reverts panic through the security service", async () => {
      const res = (await call(RpcActions.guildPanicSet, {
        active: false,
      })) as any;

      expect(security.revertPanic).toHaveBeenCalledWith(guild);
      expect(res).toEqual({ success: true, active: false, restoredCount: 3 });
    });

    it("throws when reverting a guild that is not in panic", async () => {
      security.revertPanic.mockResolvedValue(null);

      await expect(
        call(RpcActions.guildPanicSet, { active: false }),
      ).rejects.toThrow("Panic mode is not active");
    });

    it("throws when the security module is unloaded", async () => {
      utilities.delete("security");

      await expect(
        call(RpcActions.guildPanicSet, { active: true }),
      ).rejects.toThrow("The security module is not loaded");
    });

    it("rejects an actor without ManageGuild", async () => {
      denyPermissions();

      await expect(
        call(RpcActions.guildPanicSet, { active: true }, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
      expect(security.enterPanic).not.toHaveBeenCalled();
    });
  });

  describe("guild.verificationPanel", () => {
    it("returns null when the guild has no panel", async () => {
      const res = (await call(RpcActions.guildVerificationPanelGet)) as any;
      expect(res).toEqual({ panel: null });
    });

    it("upserts and reads back the panel reference", async () => {
      await call(RpcActions.guildVerificationPanelSet, {
        channelId: CHANNEL_ID,
        messageId: MESSAGE_ID,
      });

      expect(container.db.ensureGuild).toHaveBeenCalledWith(GUILD_ID);
      prisma.$seed("verificationPanel", [
        {
          guildId: GUILD_ID,
          channelId: CHANNEL_ID,
          messageId: MESSAGE_ID,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ]);

      const res = (await call(RpcActions.guildVerificationPanelGet)) as any;
      expect(res.panel).toEqual({
        channelId: CHANNEL_ID,
        messageId: MESSAGE_ID,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    it("deletes the panel and reports whether a row went away", async () => {
      prisma.$seed("verificationPanel", [
        { guildId: GUILD_ID, channelId: CHANNEL_ID, messageId: MESSAGE_ID },
      ]);

      const first = (await call(RpcActions.guildVerificationPanelDelete)) as any;
      const second = (await call(RpcActions.guildVerificationPanelDelete)) as any;

      expect(first).toEqual({ success: true, deleted: true });
      expect(second).toEqual({ success: true, deleted: false });
      expect(prisma.$all("verificationPanel")).toHaveLength(0);
    });

    it("rejects an actor without ManageGuild", async () => {
      denyPermissions();

      await expect(
        call(
          RpcActions.guildVerificationPanelSet,
          { channelId: CHANNEL_ID, messageId: MESSAGE_ID },
          INTRUDER_ID,
        ),
      ).rejects.toThrow("Missing ManageGuild permission");
    });
  });

  describe("guild.tempvc.generators", () => {
    it("lists only this guild's generators", async () => {
      prisma.$seed("tempVcGenerator", [
        { guildId: GUILD_ID, channelId: CHANNEL_ID, name: "Gaming {}", limit: 5 },
        { guildId: "999999999999999999", channelId: MESSAGE_ID, name: "Other {}", limit: 0 },
      ]);

      const res = (await call(RpcActions.guildTempVcGeneratorsList)) as any;

      expect(res.generators).toEqual([
        { channelId: CHANNEL_ID, name: "Gaming {}", limit: 5 },
      ]);
    });

    it("upserts through the tempvc service so its registry is invalidated", async () => {
      const res = (await call(RpcActions.guildTempVcGeneratorSet, {
        channelId: CHANNEL_ID,
        name: "Gaming {}",
        limit: 5,
      })) as any;

      expect(container.db.ensureGuild).toHaveBeenCalledWith(GUILD_ID);
      expect(tempvc.addGenerator).toHaveBeenCalledWith(GUILD_ID, CHANNEL_ID, {
        name: "Gaming {}",
        limit: 5,
      });
      expect(res).toEqual({ success: true, channelId: CHANNEL_ID, deleted: false });
    });

    it("defaults the user limit to unlimited", async () => {
      await call(RpcActions.guildTempVcGeneratorSet, {
        channelId: CHANNEL_ID,
        name: "Gaming {}",
      });

      expect(tempvc.addGenerator).toHaveBeenCalledWith(GUILD_ID, CHANNEL_ID, {
        name: "Gaming {}",
        limit: 0,
      });
    });

    it("deletes the generator when name is null", async () => {
      const res = (await call(RpcActions.guildTempVcGeneratorSet, {
        channelId: CHANNEL_ID,
        name: null,
      })) as any;

      expect(tempvc.removeGenerator).toHaveBeenCalledWith(GUILD_ID, CHANNEL_ID);
      expect(tempvc.addGenerator).not.toHaveBeenCalled();
      expect(res).toEqual({ success: true, channelId: CHANNEL_ID, deleted: true });
    });

    it("throws when the tempvc module is unloaded", async () => {
      utilities.delete("tempvc");

      await expect(
        call(RpcActions.guildTempVcGeneratorSet, {
          channelId: CHANNEL_ID,
          name: "Gaming {}",
        }),
      ).rejects.toThrow("The tempvc module is not loaded");
    });

    it("rejects an actor without ManageGuild", async () => {
      denyPermissions();

      await expect(
        call(
          RpcActions.guildTempVcGeneratorSet,
          { channelId: CHANNEL_ID, name: "Gaming {}" },
          INTRUDER_ID,
        ),
      ).rejects.toThrow("Missing ManageGuild permission");
      expect(tempvc.addGenerator).not.toHaveBeenCalled();
    });
  });

  describe("guild.tempvc.records.list", () => {
    it("projects live records with serialized dates", async () => {
      prisma.$seed("tempVcRecord", [
        {
          guildId: GUILD_ID,
          channelId: CHANNEL_ID,
          ownerId: OWNER_ID,
          generatorId: MESSAGE_ID,
          name: "Gaming 1",
          number: 1,
          locked: true,
          hidden: false,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          guildId: "999999999999999999",
          channelId: MESSAGE_ID,
          ownerId: OWNER_ID,
          generatorId: MESSAGE_ID,
          name: "Other 1",
          number: 1,
          locked: false,
          hidden: false,
          createdAt: new Date(),
        },
      ]);

      const res = (await call(RpcActions.guildTempVcRecordsList)) as any;

      expect(res.records).toEqual([
        {
          channelId: CHANNEL_ID,
          ownerId: OWNER_ID,
          generatorId: MESSAGE_ID,
          name: "Gaming 1",
          number: 1,
          locked: true,
          hidden: false,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ]);
    });

    it("rejects an actor without ManageGuild", async () => {
      denyPermissions();

      await expect(
        call(RpcActions.guildTempVcRecordsList, undefined, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
    });
  });
});

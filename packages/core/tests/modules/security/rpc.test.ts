import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import type { RpcActionName } from "@lumi/contracts/rpc";
import { getRpcHandler, registerRpcHandlers } from "#lib/rpc/registry.js";
import { SecurityRepository } from "#lib/prisma/repositories/SecurityRepository.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";

const GUILD_ID = "123456789012345678";
const OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";
const CHANNEL_ID = "444444444444444444";
const MESSAGE_ID = "555555555555555555";

describe("security module RPC handlers", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let guild: any;
  let utilities: Map<string, unknown>;
  let loadedModules: Set<string>;
  let security: {
    enterPanic: ReturnType<typeof vi.fn>;
    revertPanic: ReturnType<typeof vi.fn>;
    postOrEditVerifyPanel: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
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
    (container as any).db = db;

    security = {
      enterPanic: vi
        .fn()
        .mockResolvedValue({ invitesPaused: true, lockedCount: 3, skippedCount: 0 }),
      revertPanic: vi.fn().mockResolvedValue({ restoredCount: 3 }),
      postOrEditVerifyPanel: vi.fn(),
    };

    utilities = new Map<string, unknown>([["security", security]]);
    loadedModules = new Set(["security"]);

    container.stores = {
      get: vi.fn((name: string) =>
        name === "utilities"
          ? { get: (key: string) => utilities.get(key) }
          : {
              loaded: () => [],
              get: (key: string) => (loadedModules.has(key) ? { name: key } : undefined),
            },
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

  const denyPermissions = () =>
    guild.members.fetch.mockResolvedValue({
      permissions: { has: vi.fn().mockReturnValue(false) },
    });

  describe("guild.panic.get", () => {
    it("reports an inactive guild with no panic row", async () => {
      const res = (await call("guild.panic.get")) as any;

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

      const res = (await call("guild.panic.get")) as any;

      expect(res.active).toBe(true);
      expect(res.invitesPaused).toBe(true);
      expect(res.lockedChannelIds).toEqual([CHANNEL_ID, MESSAGE_ID]);
      expect(res.startedAt).toBe("2026-01-01T00:00:00.000Z");
    });

    it("still answers while the security module is unloaded", async () => {
      utilities.delete("security");
      loadedModules.delete("security");

      const res = (await call("guild.panic.get")) as any;
      expect(res.active).toBe(false);
    });

    it("rejects an actor without ManageGuild", async () => {
      denyPermissions();

      await expect(
        call("guild.panic.get", undefined, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
    });
  });

  describe("guild.panic.set", () => {
    it("enters panic through the security service", async () => {
      const res = (await call("guild.panic.set", {
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
        call("guild.panic.set", { active: true }),
      ).rejects.toThrow("Panic mode is already active");
      expect(security.enterPanic).not.toHaveBeenCalled();
    });

    it("reverts panic through the security service", async () => {
      const res = (await call("guild.panic.set", {
        active: false,
      })) as any;

      expect(security.revertPanic).toHaveBeenCalledWith(guild);
      expect(res).toEqual({ success: true, active: false, restoredCount: 3 });
    });

    it("throws when reverting a guild that is not in panic", async () => {
      security.revertPanic.mockResolvedValue(null);

      await expect(
        call("guild.panic.set", { active: false }),
      ).rejects.toThrow("Panic mode is not active");
    });

    it("throws when the security module is unloaded", async () => {
      utilities.delete("security");
      loadedModules.delete("security");

      await expect(
        call("guild.panic.set", { active: true }),
      ).rejects.toThrow("The security module is not loaded");
    });

    it("rejects an actor without ManageGuild", async () => {
      denyPermissions();

      await expect(
        call("guild.panic.set", { active: true }, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
      expect(security.enterPanic).not.toHaveBeenCalled();
    });
  });

  describe("guild.verificationPanel", () => {
    it("returns null when the guild has no panel", async () => {
      const res = (await call("guild.verificationPanel.get")) as any;
      expect(res).toEqual({ panel: null });
    });

    it("posts (or edits) the panel through the security utility", async () => {
      security.postOrEditVerifyPanel.mockResolvedValue({
        channelId: CHANNEL_ID,
        messageId: MESSAGE_ID,
        posted: true,
        edited: false,
        moved: false,
        createdChannel: false,
        oldMessageDeleted: false,
      });

      const res = (await call("guild.verificationPanel.set", {
        channelId: CHANNEL_ID,
      })) as any;

      expect(container.db.ensureGuild).toHaveBeenCalledWith(GUILD_ID);
      expect(security.postOrEditVerifyPanel).toHaveBeenCalledWith(guild, {
        channelId: CHANNEL_ID,
        createChannel: undefined,
        deleteOldMessage: undefined,
      });
      expect(res).toEqual({
        success: true,
        channelId: CHANNEL_ID,
        messageId: MESSAGE_ID,
        posted: true,
        edited: false,
        moved: false,
        createdChannel: false,
        oldMessageDeleted: false,
      });

      prisma.$seed("verificationPanel", [
        {
          guildId: GUILD_ID,
          channelId: CHANNEL_ID,
          messageId: MESSAGE_ID,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ]);

      const getRes = (await call("guild.verificationPanel.get")) as any;
      expect(getRes.panel).toEqual({
        channelId: CHANNEL_ID,
        messageId: MESSAGE_ID,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    it("rejects when neither a channel nor createChannel is given", async () => {
      await expect(
        call("guild.verificationPanel.set", {}),
      ).rejects.toThrow("Pick a channel or choose to create a new one.");
      expect(security.postOrEditVerifyPanel).not.toHaveBeenCalled();
    });

    it("deletes the panel and reports whether a row went away", async () => {
      prisma.$seed("verificationPanel", [
        { guildId: GUILD_ID, channelId: CHANNEL_ID, messageId: MESSAGE_ID },
      ]);

      const first = (await call("guild.verificationPanel.delete")) as any;
      const second = (await call("guild.verificationPanel.delete")) as any;

      expect(first).toEqual({ success: true, deleted: true });
      expect(second).toEqual({ success: true, deleted: false });
      expect(prisma.$all("verificationPanel")).toHaveLength(0);
    });

    it("rejects an actor without ManageGuild", async () => {
      denyPermissions();

      await expect(
        call("guild.verificationPanel.set", { channelId: CHANNEL_ID }, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");
    });
  });
});

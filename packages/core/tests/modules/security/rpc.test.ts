import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "#lib/services.js";
import type { RpcActionName } from "@lumi/contracts/rpc";
import { getRpcHandler, registerRpcHandlers } from "#lib/rpc/registry.js";
import { SecurityRepository } from "#modules/security/data/SecurityRepository.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";
import { enterPanic, revertPanic } from "@lumi/application/services/security/panic.js";
import { postOrEditVerifyPanel } from "@lumi/application/services/security/verification.js";
import { restoreGuildFromBackup } from "@lumi/application/services/security/restore-guild.js";
import { repositoryCache } from "#lib/cache/CacheStore.js";
import { createMemoryValkey } from "../../mocks/memory-valkey.js";
import { FakeDiscordRestPort } from "#lib/discord/fake-rest-port.js";

vi.mock("@lumi/application/services/security/panic.js", () => ({
  enterPanic: vi.fn(),
  revertPanic: vi.fn(),
}));

vi.mock("@lumi/application/services/security/verification.js", () => ({
  postOrEditVerifyPanel: vi.fn(),
  loadVerificationConfig: vi.fn(),
  grantVerified: vi.fn(),
}));

vi.mock("@lumi/application/services/security/restore-guild.js", () => ({
  restoreGuildFromBackup: vi.fn(),
}));

const GUILD_ID = "123456789012345678";
const OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";
const CHANNEL_ID = "444444444444444444";
const MESSAGE_ID = "555555555555555555";

function everyoneRole(permissions = "0") {
  return { id: GUILD_ID, permissions };
}

/** Wires a `DiscordRestPort` fake to answer `checkGuildManagerRest`'s guild/member lookups. */
function mockRest(opts: {
  ownerId: string;
  roles?: { id: string; permissions: string }[];
  memberRoles?: string[];
}): FakeDiscordRestPort {
  const fake = new FakeDiscordRestPort();
  fake.seedGuild({
    id: GUILD_ID,
    owner_id: opts.ownerId,
    roles: opts.roles ?? [everyoneRole()],
  } as any);
  fake.seedMember(GUILD_ID, { user: { id: INTRUDER_ID }, roles: opts.memberRoles ?? [] } as any);
  return fake;
}

describe("security module RPC handlers", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let loadedModules: Set<string>;
  const mockEnterPanic = enterPanic as ReturnType<typeof vi.fn>;
  const mockRevertPanic = revertPanic as ReturnType<typeof vi.fn>;
  const mockPostOrEditVerifyPanel = postOrEditVerifyPanel as ReturnType<typeof vi.fn>;
  const mockRestoreGuildFromBackup = restoreGuildFromBackup as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = createMockPrismaClient();

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    (container as any).discordRest = mockRest({ ownerId: OWNER_ID });

    repositoryCache.clear();
    (container as any).valkey = createMemoryValkey();

    const db = {
      ensureGuild: vi.fn().mockResolvedValue(undefined),
    } as any;
    db.security = new SecurityRepository(prisma as any, {} as any, container.logger, db);
    (container as any).db = db;

    mockEnterPanic.mockResolvedValue({
      invitesPaused: true,
      lockedCount: 3,
      skippedCount: 0,
    });
    mockRevertPanic.mockResolvedValue({ restoredCount: 3 });

    loadedModules = new Set(["security"]);

    (container as any).moduleStore = {
      get: (key: string) => (loadedModules.has(key) ? { name: key } : undefined),
      loaded: () => [],
    };

    registerRpcHandlers();
  });

  const handlerFor = (action: RpcActionName) => {
    const handler = getRpcHandler(action);
    if (!handler) throw new Error(`${action} handler not registered`);
    return handler;
  };

  const call = (action: RpcActionName, data?: unknown, actorId = OWNER_ID) =>
    handlerFor(action)({ id: "req", action, guildId: GUILD_ID, actorId, data });

  const denyPermissions = () => {
    (container as any).discordRest = mockRest({ ownerId: OWNER_ID, memberRoles: [] });
  };

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

      expect(mockEnterPanic).toHaveBeenCalledWith(GUILD_ID, OWNER_ID, [
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
      expect(mockEnterPanic).not.toHaveBeenCalled();
    });

    it("reverts panic through the security service", async () => {
      const res = (await call("guild.panic.set", {
        active: false,
      })) as any;

      expect(mockRevertPanic).toHaveBeenCalledWith(GUILD_ID);
      expect(res).toEqual({ success: true, active: false, restoredCount: 3 });
    });

    it("throws when reverting a guild that is not in panic", async () => {
      mockRevertPanic.mockResolvedValue(null);

      await expect(
        call("guild.panic.set", { active: false }),
      ).rejects.toThrow("Panic mode is not active");
    });

    it("throws when the security module is unloaded", async () => {
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
      expect(mockEnterPanic).not.toHaveBeenCalled();
    });
  });

  describe("guild.verificationPanel", () => {
    it("returns null when the guild has no panel", async () => {
      const res = (await call("guild.verificationPanel.get")) as any;
      expect(res).toEqual({ panel: null });
    });

    it("posts (or edits) the panel through the security utility", async () => {
      mockPostOrEditVerifyPanel.mockResolvedValue({
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
      expect(mockPostOrEditVerifyPanel).toHaveBeenCalledWith(container, GUILD_ID, {
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
      expect(mockPostOrEditVerifyPanel).not.toHaveBeenCalled();
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

    it("two concurrently double-submitted identical requests only post the panel once", async () => {
      mockPostOrEditVerifyPanel.mockResolvedValue({
        channelId: CHANNEL_ID,
        messageId: MESSAGE_ID,
        posted: true,
        edited: false,
        moved: false,
        createdChannel: true,
        oldMessageDeleted: false,
      });

      const input = { createChannel: true };
      const [first, second] = await Promise.allSettled([
        call("guild.verificationPanel.set", input),
        call("guild.verificationPanel.set", input),
      ]);

      expect(mockPostOrEditVerifyPanel).toHaveBeenCalledTimes(1);
      const outcomes = [first.status, second.status];
      expect(outcomes.filter((s) => s === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter((s) => s === "rejected")).toHaveLength(1);
    });

    it("a retry submitted after the first call finished replays the same result", async () => {
      mockPostOrEditVerifyPanel.mockResolvedValue({
        channelId: CHANNEL_ID,
        messageId: MESSAGE_ID,
        posted: true,
        edited: false,
        moved: false,
        createdChannel: true,
        oldMessageDeleted: false,
      });

      const input = { createChannel: true };
      const first = await call("guild.verificationPanel.set", input);
      const second = await call("guild.verificationPanel.set", input);

      expect(mockPostOrEditVerifyPanel).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
    });
  });

  describe("guild.backups.restore", () => {
    it("restores through the security service", async () => {
      mockRestoreGuildFromBackup.mockResolvedValue({
        rolesRestored: 2,
        channelsRestored: 1,
      });

      const res = (await call("guild.backups.restore", { backupId: 7 })) as any;

      expect(mockRestoreGuildFromBackup).toHaveBeenCalledWith(GUILD_ID, 7);
      expect(res).toEqual({
        success: true,
        rolesRestored: 2,
        channelsRestored: 1,
      });
    });

    it("throws and does not cache when no backup is found", async () => {
      mockRestoreGuildFromBackup.mockResolvedValue(null);

      await expect(call("guild.backups.restore", { backupId: 7 })).rejects.toThrow(
        "No backup found to restore",
      );

      mockRestoreGuildFromBackup.mockResolvedValue({
        rolesRestored: 1,
        channelsRestored: 0,
      });
      const res = (await call("guild.backups.restore", { backupId: 7 })) as any;
      expect(res).toEqual({ success: true, rolesRestored: 1, channelsRestored: 0 });
      expect(mockRestoreGuildFromBackup).toHaveBeenCalledTimes(2);
    });

    it("two concurrently double-submitted identical restores only recreate roles/channels once", async () => {
      mockRestoreGuildFromBackup.mockResolvedValue({
        rolesRestored: 3,
        channelsRestored: 5,
      });

      const [first, second] = await Promise.allSettled([
        call("guild.backups.restore", { backupId: 9 }),
        call("guild.backups.restore", { backupId: 9 }),
      ]);

      expect(mockRestoreGuildFromBackup).toHaveBeenCalledTimes(1);
      const outcomes = [first.status, second.status];
      expect(outcomes.filter((s) => s === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter((s) => s === "rejected")).toHaveLength(1);
    });

    it("a retry submitted after the first restore finished replays the same result", async () => {
      mockRestoreGuildFromBackup.mockResolvedValue({
        rolesRestored: 3,
        channelsRestored: 5,
      });

      const first = await call("guild.backups.restore", { backupId: 9 });
      const second = await call("guild.backups.restore", { backupId: 9 });

      expect(mockRestoreGuildFromBackup).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
    });

    it("a later restore of a different backup is not treated as a duplicate", async () => {
      mockRestoreGuildFromBackup
        .mockResolvedValueOnce({ rolesRestored: 1, channelsRestored: 0 })
        .mockResolvedValueOnce({ rolesRestored: 2, channelsRestored: 2 });

      const first = await call("guild.backups.restore", { backupId: 1 });
      const second = await call("guild.backups.restore", { backupId: 2 });

      expect(mockRestoreGuildFromBackup).toHaveBeenCalledTimes(2);
      expect(first).not.toEqual(second);
    });
  });
});

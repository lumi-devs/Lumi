import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import TempVcService from "#modules/tempvc/services/TempVcService.js";
import { container } from "@sapphire/framework";
import { tempVcRegistry } from "#modules/tempvc/registry.js";
import { scheduleTask } from "#lib/schedule-task.js";
import { isVoiceChannelEmpty, clearVoiceChannelOccupancy } from "#modules/tempvc/lib/voice-occupancy.js";
import { setVcRecord, listVcRecords, listGenerators, removeVcRecord, getVcRecord } from "#modules/tempvc/data.js";

vi.mock("#lib/schedule-task.js", () => ({
  scheduleTask: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("#modules/tempvc/lib/voice-occupancy.js", () => ({
  isVoiceChannelEmpty: vi.fn(),
  clearVoiceChannelOccupancy: vi.fn(),
}));

vi.mock("#modules/tempvc/data.js", () => ({
  setVcRecord: vi.fn(),
  listVcRecords: vi.fn(),
  listGenerators: vi.fn(),
  removeVcRecord: vi.fn(),
  getVcRecord: vi.fn(),
}));

vi.mock("#modules/tempvc/registry.js", () => ({
  tempVcRegistry: {
    nextNumber: vi.fn(),
    addVc: vi.fn(),
    removeVc: vi.fn(),
  },
}));

vi.mock("#modules/tempvc/ui/panel.js", () => ({
  buildPanel: vi.fn(() => ({ content: "panel" })),
}));

describe("TempVcService", () => {
  let service: TempVcService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Directly assign mock properties to the global container
    container.redis = {
      set: vi.fn(),
    } as any;
    container.logger = {
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
    } as any;
    container.client = {
      rest: {
        delete: vi.fn(),
      },
    } as any;

    service = new TempVcService(
      { name: "tempvc", store: { name: "services" } } as any,
      {}
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("onCreateCooldown", () => {
    it("returns false if NX set succeeds (no cooldown)", async () => {
      (container.redis.set as any).mockResolvedValue("OK");
      const result = await service.onCreateCooldown("guild-1", "user-1");
      expect(result).toBe(false);
    });

    it("returns true if NX set returns null (cooldown active)", async () => {
      (container.redis.set as any).mockResolvedValue(null);
      const result = await service.onCreateCooldown("guild-1", "user-1");
      expect(result).toBe(true);
    });
  });

  describe("createVc", () => {
    it("creates a VC, moves member, registers VC, and schedules reordering", async () => {
      const mockChannel = {
        id: "vc-123",
        guild: { id: "guild-1" },
        parentId: "cat-123",
        isVoiceBased: () => true,
        delete: vi.fn().mockResolvedValue(true),
        send: vi.fn().mockResolvedValue(true),
      };

      const mockGuild = {
        id: "guild-1",
        channels: {
          cache: new Map([
            ["vc-123", mockChannel],
          ]),
          create: vi.fn().mockResolvedValue(mockChannel),
        },
      };

      const mockMember = {
        id: "member-1",
        user: { tag: "User#1234" },
        guild: mockGuild,
        voice: {
          setChannel: vi.fn().mockResolvedValue(true),
        },
      };

      const mockGenerator = {
        id: "gen-123",
        parentId: "cat-123",
        isVoiceBased: () => true,
      };

      (tempVcRegistry.nextNumber as any).mockResolvedValue(2);
      (listVcRecords as any).mockResolvedValue(new Map());
      (listGenerators as any).mockResolvedValue(new Map());

      await service.createVc(mockMember as any, mockGenerator as any, {
        name: "Gaming {}",
        limit: 5,
      });

      expect(mockGuild.channels.create).toHaveBeenCalledWith({
        name: "Gaming 2",
        type: 2,
        parent: "cat-123",
        userLimit: 5,
        reason: "Temp VC created by User#1234",
      });

      expect(mockMember.voice.setChannel).toHaveBeenCalledWith(mockChannel);
      expect(setVcRecord).toHaveBeenCalledWith("guild-1", "vc-123", {
        ownerId: "member-1",
        generatorId: "gen-123",
        name: "Gaming 2",
        number: 2,
        locked: false,
        hidden: false,
        createdAt: expect.any(Number),
      });

      expect(mockChannel.send).toHaveBeenCalled();

      // Check reordering scheduled
      await vi.advanceTimersByTimeAsync(1000);
      expect(listVcRecords).toHaveBeenCalled();
    });

    it("deletes the created VC if user voice move fails", async () => {
      const mockChannel = {
        id: "vc-123",
        guild: { id: "guild-1" },
        parentId: "cat-123",
        delete: vi.fn().mockResolvedValue(true),
        send: vi.fn().mockResolvedValue(true),
      };

      const mockGuild = {
        id: "guild-1",
        channels: {
          cache: {
            has: vi.fn(() => true),
          },
          create: vi.fn().mockResolvedValue(mockChannel),
        },
      };

      const mockMember = {
        id: "member-1",
        user: { tag: "User#1234" },
        guild: mockGuild,
        voice: {
          setChannel: vi.fn().mockRejectedValue(new Error("Move failed")),
        },
      };

      const mockGenerator = {
        id: "gen-123",
        parentId: "cat-123",
        isVoiceBased: () => true,
      };

      (tempVcRegistry.nextNumber as any).mockResolvedValue(2);

      await service.createVc(mockMember as any, mockGenerator as any, {
        name: "Gaming {}",
        limit: 5,
      });

      expect(mockChannel.delete).toHaveBeenCalledWith("Temp VC owner left before move");
      expect(setVcRecord).not.toHaveBeenCalled();
    });
  });

  describe("reorderChannels", () => {
    it("reorders category channels putting generators first, managed VCs in order, static VCs last", async () => {
      const genChan = { id: "gen-1", parentId: "cat-1", isVoiceBased: () => true, position: 2 };
      const managedChan1 = { id: "managed-1", parentId: "cat-1", isVoiceBased: () => true, position: 0 };
      const managedChan2 = { id: "managed-2", parentId: "cat-1", isVoiceBased: () => true, position: 1 };
      const staticChan = { id: "static-1", parentId: "cat-1", isVoiceBased: () => true, position: 3 };

      const mockGuild = {
        id: "guild-1",
        channels: {
          cache: new Map([
            ["gen-1", genChan],
            ["managed-1", managedChan1],
            ["managed-2", managedChan2],
            ["static-1", staticChan],
          ]),
          setPositions: vi.fn().mockResolvedValue(true),
        },
      };

      (listVcRecords as any).mockResolvedValue(
        new Map([
          ["managed-1", { generatorId: "gen-1", number: 1 } as any],
          ["managed-2", { generatorId: "gen-1", number: 2 } as any],
        ])
      );

      (listGenerators as any).mockResolvedValue(
        new Map([
          ["gen-1", { name: "Gaming", limit: 5 }],
        ])
      );

      await service.reorderChannels(mockGuild as any, "cat-1");

      expect(mockGuild.channels.setPositions).toHaveBeenCalledWith([
        { channel: "gen-1", position: 0 },
        { channel: "managed-1", position: 1 },
        { channel: "managed-2", position: 2 },
        { channel: "static-1", position: 3 },
      ]);
    });
  });

  describe("scheduleCleanup", () => {
    it("schedules a tempvc-cleanup task", async () => {
      await service.scheduleCleanup("guild-1", "vc-123");
      expect(scheduleTask).toHaveBeenCalledWith(
        "tempvc-cleanup",
        { guildId: "guild-1", channelId: "vc-123" },
        expect.objectContaining({
          repeated: false,
          delay: expect.any(Number),
        })
      );
    });
  });

  describe("runCleanup", () => {
    it("does not delete channel if not registered", async () => {
      (getVcRecord as any).mockResolvedValue(null);

      await service.runCleanup({ guildId: "guild-1", channelId: "vc-123" });

      expect(isVoiceChannelEmpty).not.toHaveBeenCalled();
      expect(container.client.rest.delete).not.toHaveBeenCalled();
    });

    it("does not delete channel if it is not empty", async () => {
      (getVcRecord as any).mockResolvedValue({ ownerId: "owner-1" } as any);
      (isVoiceChannelEmpty as any).mockResolvedValue(false);

      await service.runCleanup({ guildId: "guild-1", channelId: "vc-123" });

      expect(container.client.rest.delete).not.toHaveBeenCalled();
    });

    it("deletes empty channel and removes record", async () => {
      (getVcRecord as any).mockResolvedValue({ ownerId: "owner-1" } as any);
      (isVoiceChannelEmpty as any).mockResolvedValue(true);
      (container.client.rest.delete as any).mockResolvedValue({} as any);

      await service.runCleanup({ guildId: "guild-1", channelId: "vc-123" });

      expect(container.client.rest.delete).toHaveBeenCalledWith("/channels/vc-123", {
        reason: "Empty temp VC cleanup",
      });
      expect(removeVcRecord).toHaveBeenCalledWith("guild-1", "vc-123");
      expect(clearVoiceChannelOccupancy).toHaveBeenCalledWith("vc-123");
    });
  });

  describe("setLock", () => {
    it("updates permission overwrites and registers changes", async () => {
      const mockChannel = {
        guild: {
          id: "guild-1",
          roles: { everyone: { id: "everyone-id" } },
        },
        id: "vc-123",
        members: new Map(),
        permissionOverwrites: {
          edit: vi.fn().mockResolvedValue(true),
        },
      };

      const record: any = { ownerId: "owner-1", generatorId: "gen-1", locked: false };

      const result = await service.setLock(mockChannel as any, record, true);

      expect(mockChannel.permissionOverwrites.edit).toHaveBeenCalledWith(
        mockChannel.guild.roles.everyone,
        { Connect: false }
      );
      expect(setVcRecord).toHaveBeenCalledWith("guild-1", "vc-123", {
        ...record,
        locked: true,
      });
      expect(result.locked).toBe(true);
    });
  });

  describe("setHide", () => {
    it("updates permission overwrites and registers changes", async () => {
      const mockChannel = {
        guild: {
          id: "guild-1",
          roles: { everyone: { id: "everyone-id" } },
        },
        id: "vc-123",
        members: new Map(),
        permissionOverwrites: {
          edit: vi.fn().mockResolvedValue(true),
        },
      };

      const record: any = { ownerId: "owner-1", generatorId: "gen-1", hidden: false };

      const result = await service.setHide(mockChannel as any, record, true);

      expect(mockChannel.permissionOverwrites.edit).toHaveBeenCalledWith(
        mockChannel.guild.roles.everyone,
        { ViewChannel: false }
      );
      expect(setVcRecord).toHaveBeenCalledWith("guild-1", "vc-123", {
        ...record,
        hidden: true,
      });
      expect(result.hidden).toBe(true);
    });
  });

  describe("setOwner", () => {
    it("updates owner permissions and updates record", async () => {
      const mockChannel = {
        guild: { id: "guild-1" },
        id: "vc-123",
        permissionOverwrites: {
          cache: new Map([["old-owner", {}]]),
          edit: vi.fn().mockResolvedValue(true),
        },
      };

      const record: any = { ownerId: "old-owner" };

      const result = await service.setOwner(mockChannel as any, record, "new-owner");

      expect(mockChannel.permissionOverwrites.edit).toHaveBeenCalledWith("old-owner", {
        ManageChannels: null,
      });
      expect(mockChannel.permissionOverwrites.edit).toHaveBeenCalledWith("new-owner", {
        ManageChannels: true,
      });
      expect(setVcRecord).toHaveBeenCalledWith("guild-1", "vc-123", {
        ownerId: "new-owner",
      });
      expect(result.ownerId).toBe("new-owner");
    });
  });

  describe("canManage", () => {
    it("returns true if member has ManageChannels permission", () => {
      const mockMember = {};
      const mockChannel = {
        permissionsFor: vi.fn(() => ({
          has: vi.fn(() => true),
        })),
      };

      const result = service.canManage(mockMember as any, mockChannel as any);
      expect(result).toBe(true);
      expect(mockChannel.permissionsFor).toHaveBeenCalledWith(mockMember);
    });

    it("returns false if member lacks ManageChannels permission", () => {
      const mockMember = {};
      const mockChannel = {
        permissionsFor: vi.fn(() => ({
          has: vi.fn(() => false),
        })),
      };

      const result = service.canManage(mockMember as any, mockChannel as any);
      expect(result).toBe(false);
    });
  });
});

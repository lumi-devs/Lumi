import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import TempVcService, {
  resolveGeneratorName,
} from "#modules/tempvc/services/TempVcService.js";
import { container } from "@sapphire/framework";
import { tempVcRegistry } from "#modules/tempvc/registry.js";
import { scheduleTask } from "#lib/schedule-task.js";
import { isVoiceChannelEmpty, clearVoiceChannelOccupancy } from "#modules/tempvc/lib/voice-occupancy.js";
import { setVcRecord, patchVcRecord, listVcRecords, listGenerators, removeVcRecord, getVcRecord, setGenerator, removeGenerator } from "#modules/tempvc/data.js";

vi.mock("#lib/schedule-task.js", () => ({
  scheduleTask: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("#modules/tempvc/lib/voice-occupancy.js", () => ({
  isVoiceChannelEmpty: vi.fn(),
  clearVoiceChannelOccupancy: vi.fn(),
}));

vi.mock("#modules/tempvc/data.js", () => ({
  setVcRecord: vi.fn(),
  patchVcRecord: vi.fn(),
  listVcRecords: vi.fn(),
  listGenerators: vi.fn(),
  removeVcRecord: vi.fn(),
  getVcRecord: vi.fn(),
  setGenerator: vi.fn(),
  removeGenerator: vi.fn(),
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
    (container as any).redis = {
      set: vi.fn(),
    } as any;
    (container as any).db = {
      config: {
        getModuleConfig: vi.fn().mockResolvedValue(null),
      },
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
      vi.advanceTimersByTime(1000);
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
      expect(patchVcRecord).toHaveBeenCalledWith("guild-1", "vc-123", {
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
      expect(patchVcRecord).toHaveBeenCalledWith("guild-1", "vc-123", {
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
      expect(patchVcRecord).toHaveBeenCalledWith("guild-1", "vc-123", {
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

  describe("onLoad & moduleName", () => {
    it("onLoad executes without throwing and moduleName returns 'tempvc'", () => {
      expect(() => service.onLoad()).not.toThrow();
      expect(service.moduleName).toBe("tempvc");
    });
  });

  describe("reconcileGuild", () => {
    it("scans guild vc records and schedules cleanup for each channel", async () => {
      const mockGuild = { id: "guild-1" };
      (listVcRecords as any).mockResolvedValue(
        new Map([
          ["vc-1", {} as any],
          ["vc-2", {} as any],
        ])
      );

      await service.reconcileGuild(mockGuild as any);

      expect(scheduleTask).toHaveBeenCalledWith(
        "tempvc-cleanup",
        { guildId: "guild-1", channelId: "vc-1" },
        expect.any(Object)
      );
      expect(scheduleTask).toHaveBeenCalledWith(
        "tempvc-cleanup",
        { guildId: "guild-1", channelId: "vc-2" },
        expect.any(Object)
      );
    });
  });

  describe("runCleanup error handling", () => {
    it("handles Discord API error codes 10003 and 50013 gracefully without rethrowing", async () => {
      (getVcRecord as any).mockResolvedValue({ ownerId: "owner-1" } as any);
      (isVoiceChannelEmpty as any).mockResolvedValue(true);

      const err10003: any = new Error("Unknown Channel");
      err10003.code = 10003;
      (container.client.rest.delete as any).mockRejectedValueOnce(err10003);

      await service.runCleanup({ guildId: "guild-1", channelId: "vc-10003" });
      expect(removeVcRecord).toHaveBeenCalledWith("guild-1", "vc-10003");
      expect(clearVoiceChannelOccupancy).toHaveBeenCalledWith("vc-10003");

      const err50013: any = new Error("Missing Permissions");
      err50013.code = 50013;
      (container.client.rest.delete as any).mockRejectedValueOnce(err50013);

      await service.runCleanup({ guildId: "guild-1", channelId: "vc-50013" });
      expect(removeVcRecord).toHaveBeenCalledWith("guild-1", "vc-50013");
      expect(clearVoiceChannelOccupancy).toHaveBeenCalledWith("vc-50013");
    });

    it("rethrows unexpected API errors during cleanup", async () => {
      (getVcRecord as any).mockResolvedValue({ ownerId: "owner-1" } as any);
      (isVoiceChannelEmpty as any).mockResolvedValue(true);

      const unexpectedErr: any = new Error("Internal Error");
      unexpectedErr.code = 50000;
      (container.client.rest.delete as any).mockRejectedValueOnce(unexpectedErr);

      await expect(
        service.runCleanup({ guildId: "guild-1", channelId: "vc-err" })
      ).rejects.toThrow("Internal Error");
    });
  });

  describe("generator management", () => {
    it("addGenerator calls setGenerator", async () => {
      const config = { name: "Gen", limit: 0 };
      await service.addGenerator("guild-1", "chan-1", config);
      expect(setGenerator).toHaveBeenCalledWith("guild-1", "chan-1", config);
    });

    it("removeGenerator calls removeGenerator", async () => {
      (removeGenerator as any).mockResolvedValue(true);
      const res = await service.removeGenerator("guild-1", "chan-1");
      expect(res).toBe(true);
      expect(removeGenerator).toHaveBeenCalledWith("guild-1", "chan-1");
    });

    it("listGenerators calls listGenerators data function", async () => {
      const expected = new Map([["chan-1", { name: "Gen", limit: 0 }]]);
      (listGenerators as any).mockResolvedValue(expected);
      const res = await service.listGenerators("guild-1");
      expect(res).toBe(expected);
    });
  });

  describe("reorderChannels edge cases", () => {
    it("returns early when no category channels exist", async () => {
      const mockGuild = {
        id: "guild-1",
        channels: {
          cache: new Map(),
        },
      };

      await service.reorderChannels(mockGuild as any, "cat-empty");
      expect(listVcRecords).not.toHaveBeenCalled();
    });

    it("skips position update when channels are already ordered", async () => {
      const genChan = { id: "gen-1", parentId: "cat-1", isVoiceBased: () => true, position: 0 };
      const mockGuild = {
        id: "guild-1",
        channels: {
          cache: new Map([["gen-1", genChan]]),
          setPositions: vi.fn(),
        },
      };
      (listVcRecords as any).mockResolvedValue(new Map());
      (listGenerators as any).mockResolvedValue(new Map([["gen-1", {} as any]]));

      await service.reorderChannels(mockGuild as any, "cat-1");
      expect(mockGuild.channels.setPositions).not.toHaveBeenCalled();
    });
  });

  describe("setLock and setHide with active members", () => {
    it("grants active channel members explicit connect permission when locking", async () => {
      const mockMember1 = { id: "mem-1" };
      const mockMember2 = { id: "mem-2" };

      const mockChannel = {
        guild: {
          id: "guild-1",
          roles: { everyone: { id: "everyone-id" } },
        },
        id: "vc-123",
        members: new Map([
          ["mem-1", mockMember1],
          ["mem-2", mockMember2],
        ]),
        permissionOverwrites: {
          edit: vi.fn().mockResolvedValue(true),
        },
      };

      const record: any = { ownerId: "owner-1", generatorId: "gen-1", locked: false };
      await service.setLock(mockChannel as any, record, true);

      expect(mockChannel.permissionOverwrites.edit).toHaveBeenCalledWith("mem-1", { Connect: true });
      expect(mockChannel.permissionOverwrites.edit).toHaveBeenCalledWith("mem-2", { Connect: true });
    });
  });

  describe("setOwner when old owner is not cached in permissionOverwrites", () => {
    it("only edits new owner permission overwrite", async () => {
      const mockChannel = {
        guild: { id: "guild-1" },
        id: "vc-123",
        permissionOverwrites: {
          cache: new Map(),
          edit: vi.fn().mockResolvedValue(true),
        },
      };

      const record: any = { ownerId: "old-owner-not-in-cache" };
      const result = await service.setOwner(mockChannel as any, record, "new-owner");

      expect(mockChannel.permissionOverwrites.edit).toHaveBeenCalledTimes(1);
      expect(mockChannel.permissionOverwrites.edit).toHaveBeenCalledWith("new-owner", {
        ManageChannels: true,
      });
      expect(result.ownerId).toBe("new-owner");
    });
  });

  describe("resolveGeneratorName", () => {
    const member = {
      user: { username: "raw_user" },
      displayName: "Nicky",
    } as any;

    it("substitutes {} with the sequence number", () => {
      expect(resolveGeneratorName("Gaming {}", { number: 3, member })).toBe(
        "Gaming 3",
      );
    });

    it("substitutes {number} with the sequence number", () => {
      expect(
        resolveGeneratorName("Room {number}", { number: 7, member }),
      ).toBe("Room 7");
    });

    it("substitutes {position} as an alias of {number}", () => {
      expect(
        resolveGeneratorName("Spot #{position}", { number: 4, member }),
      ).toBe("Spot #4");
    });

    it("substitutes {username} with the raw account username", () => {
      expect(
        resolveGeneratorName("{username}'s Room", { number: 1, member }),
      ).toBe("raw_user's Room");
    });

    it("substitutes {name} with the member's display name", () => {
      expect(
        resolveGeneratorName("{name}'s Room", { number: 1, member }),
      ).toBe("Nicky's Room");
    });

    it("supports multiple placeholders in one template", () => {
      expect(
        resolveGeneratorName("{name} ({username}) #{number}", {
          number: 5,
          member,
        }),
      ).toBe("Nicky (raw_user) #5");
    });

    it("appends the number when the template has no placeholder", () => {
      expect(resolveGeneratorName("Gaming", { number: 2, member })).toBe(
        "Gaming 2",
      );
    });

    it("truncates the resolved name to 100 characters after substitution", () => {
      const longMember = {
        user: { username: "a".repeat(150) },
        displayName: "b".repeat(150),
      } as any;
      const result = resolveGeneratorName("{username}", {
        number: 1,
        member: longMember,
      });
      expect(result).toHaveLength(100);
      expect(result).toBe("a".repeat(100));
    });
  });
});

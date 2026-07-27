import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { AdministratorPrecondition } from "#lib/permissions/preconditions/Administrator.js";
import { BotOwnerPrecondition } from "#lib/permissions/preconditions/BotOwner.js";
import { GuildOwnerPrecondition } from "#lib/permissions/preconditions/GuildOwner.js";
import { ModeratorPrecondition } from "#lib/permissions/preconditions/Moderator.js";
import { ModuleEnabledPrecondition } from "#lib/permissions/preconditions/ModuleEnabled.js";
import { NotIgnoredPrecondition } from "#lib/permissions/preconditions/NotIgnored.js";
import { MaintenanceModePrecondition } from "#lib/permissions/preconditions/MaintenanceMode.js";
import { NotBlockedPrecondition } from "#lib/permissions/preconditions/NotBlocked.js";
import { PermissionLevel } from "#lib/permissions/index.js";

vi.mock("#lib/env.js", () => ({
  envParseString: vi.fn((_key: string, def = "") => def),
  envParseInteger: vi.fn(),
  envIsDefined: vi.fn(),
}));

describe("Permissions Preconditions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (container as any).db = {
      config: { getGuildSettings: vi.fn().mockResolvedValue({}) },
      modules: { isModuleEnabled: vi.fn().mockResolvedValue(true) },
      access: {
        getIgnoreStatus: vi.fn().mockResolvedValue({ guild: false, channel: false }),
        isUserBlocked: vi.fn().mockResolvedValue(false),
      },
      global: {
        getGlobalConfig: vi.fn().mockResolvedValue({ maintenanceMode: false }),
      },
    };
    (container as any).logger = { error: vi.fn(), warn: vi.fn() };
    (container as any).client = { application: { owner: { id: "owner-999" } } };
    (container as any).moduleStore = {
      isModuleDisableable: vi.fn().mockReturnValue(true),
      moduleNameForLocation: vi.fn().mockReturnValue(null),
    };
  });

  describe("AdministratorPrecondition", () => {
    const precondition = new AdministratorPrecondition(
      { name: "Administrator", path: "", root: "", store: {} as any } as any,
      {}
    );

    it("allows execution when user is Admin or higher", async () => {
      const mockMsg = {
        userId: "admin-1",
        guild: { id: "G1", ownerId: "owner-777" },
        member: {
          roles: { cache: { has: () => false } },
          permissions: { has: (p: string) => p === "Administrator" },
        },
      } as any;

      const msgResult = await precondition.messageRun(mockMsg);
      expect(msgResult.isOk()).toBe(true);

      const interactionResult = await precondition.chatInputRun(mockMsg);
      expect(interactionResult.isOk()).toBe(true);
    });

    it("denies execution when user lacks Admin level", async () => {
      const mockMsg = {
        userId: "user-1",
        guild: { id: "G1", ownerId: "owner-777" },
        member: {
          roles: { cache: { has: () => false } },
          permissions: { has: () => false },
        },
      } as any;

      const result = await precondition.messageRun(mockMsg);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.unwrapErr().identifier).toBe("PermissionDenied");
        expect(result.unwrapErr().message).toContain("Administrator");
      }
    });
  });

  describe("BotOwnerPrecondition", () => {
    const precondition = new BotOwnerPrecondition(
      { name: "BotOwner", path: "", root: "", store: {} as any } as any,
      {}
    );

    it("allows execution when user is Bot Owner", async () => {
      const mockMsg = {
        userId: "owner-999",
        guild: { id: "G1", ownerId: "guild-owner" },
        member: {
          roles: { cache: { has: () => false } },
          permissions: { has: () => false },
        },
      } as any;

      const result = await precondition.chatInputRun(mockMsg);
      expect(result.isOk()).toBe(true);
    });

    it("denies execution when user is not Bot Owner", async () => {
      const mockMsg = {
        userId: "regular-user",
        guild: { id: "G1", ownerId: "guild-owner" },
        member: {
          roles: { cache: { has: () => false } },
          permissions: { has: (p: string) => p === "Administrator" },
        },
      } as any;

      const result = await precondition.messageRun(mockMsg);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.unwrapErr().identifier).toBe("PermissionDenied");
        expect(result.unwrapErr().message).toContain("Bot Owner");
      }
    });
  });

  describe("GuildOwnerPrecondition", () => {
    const precondition = new GuildOwnerPrecondition(
      { name: "GuildOwner", path: "", root: "", store: {} as any } as any,
      {}
    );

    it("allows execution when user is Guild Owner", async () => {
      const mockMsg = {
        userId: "guild-owner",
        guild: { id: "G1", ownerId: "guild-owner" },
        member: {
          roles: { cache: { has: () => false } },
          permissions: { has: () => false },
        },
      } as any;

      const result = await precondition.chatInputRun(mockMsg);
      expect(result.isOk()).toBe(true);
    });

    it("denies execution when user is not Guild Owner", async () => {
      const mockMsg = {
        userId: "admin-user",
        guild: { id: "G1", ownerId: "guild-owner" },
        member: {
          roles: { cache: { has: () => false } },
          permissions: { has: (p: string) => p === "Administrator" },
        },
      } as any;

      const result = await precondition.messageRun(mockMsg);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.unwrapErr().identifier).toBe("PermissionDenied");
        expect(result.unwrapErr().message).toContain("Server Owner");
      }
    });
  });

  describe("ModeratorPrecondition", () => {
    const precondition = new ModeratorPrecondition(
      { name: "Moderator", path: "", root: "", store: {} as any } as any,
      {}
    );

    it("allows execution when user is Moderator or higher", async () => {
      const mockMsg = {
        userId: "mod-1",
        guild: { id: "G1", ownerId: "guild-owner" },
        member: {
          roles: { cache: { has: () => false } },
          permissions: { has: (p: string) => p === "ManageMessages" },
        },
      } as any;

      const result = await precondition.chatInputRun(mockMsg);
      expect(result.isOk()).toBe(true);
    });

    it("denies execution when user lacks Moderator level", async () => {
      const mockMsg = {
        userId: "regular-user",
        guild: { id: "G1", ownerId: "guild-owner" },
        member: {
          roles: { cache: { has: () => false } },
          permissions: { has: () => false },
        },
      } as any;

      const result = await precondition.messageRun(mockMsg);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.unwrapErr().identifier).toBe("PermissionDenied");
        expect(result.unwrapErr().message).toContain("Moderator");
      }
    });
  });

  describe("ModuleEnabledPrecondition", () => {
    const precondition = new ModuleEnabledPrecondition(
      { name: "ModuleEnabled", path: "", root: "", store: {} as any } as any,
      {}
    );

    it("allows execution when command has no module name", async () => {
      const mockCmd = { options: {}, location: { full: "/lib/commands.ts" } } as any;
      const mockInteraction = { guildId: "G1" } as any;

      const result = await precondition.chatInputRun(mockInteraction, mockCmd);
      expect(result.isOk()).toBe(true);
    });

    it("allows execution when module is non-disableable", async () => {
      container.moduleStore.isModuleDisableable = vi.fn().mockReturnValue(false);
      const mockCmd = { options: { module: "core" } } as any;
      const mockInteraction = { guildId: "G1" } as any;

      const result = await precondition.chatInputRun(mockInteraction, mockCmd);
      expect(result.isOk()).toBe(true);
      expect(container.db.modules.isModuleEnabled).not.toHaveBeenCalled();
    });

    it("allows execution when module is enabled for guild", async () => {
      (container.db.modules.isModuleEnabled as any).mockResolvedValue(true);
      const mockCmd = { options: { module: "afk" } } as any;
      const mockMessage = { guildId: "G1" } as any;

      const result = await precondition.messageRun(mockMessage, mockCmd);
      expect(result.isOk()).toBe(true);
      expect(container.db.modules.isModuleEnabled).toHaveBeenCalledWith("G1", "afk");
    });

    it("returns error when module is disabled in a guild", async () => {
      (container.db.modules.isModuleEnabled as any).mockResolvedValue(false);
      const mockCmd = { options: { module: "filter" } } as any;
      const mockContextMenu = { guildId: "G1" } as any;

      const result = await precondition.contextMenuRun(mockContextMenu, mockCmd);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.unwrapErr().identifier).toBe("ModuleEnabled");
        expect(result.unwrapErr().message).toContain("filter");
        expect(result.unwrapErr().message).toContain("disabled in this server");
      }
    });

    it("returns generic error when module is disabled without a guildId", async () => {
      (container.db.modules.isModuleEnabled as any).mockResolvedValue(false);
      const mockCmd = { options: { module: "filter" } } as any;
      const mockMessage = { guildId: null } as any;

      const result = await precondition.messageRun(mockMessage, mockCmd);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.unwrapErr().message).toBe("This feature is currently disabled.");
      }
    });

    it("resolves module name from location when not in options", async () => {
      container.moduleStore.moduleNameForLocation = vi.fn().mockReturnValue("economy");
      const mockCmd = {
        options: {},
        location: { full: "/home/user/project/modules/economy/commands/balance.ts" },
      } as any;
      const mockInteraction = { guildId: "G1" } as any;

      await precondition.chatInputRun(mockInteraction, mockCmd);
      expect(container.db.modules.isModuleEnabled).toHaveBeenCalledWith("G1", "economy");
    });

    it("resolves module name via regex matching location when store fails", async () => {
      container.moduleStore.moduleNameForLocation = vi.fn().mockReturnValue(null);
      const mockCmd = {
        options: {},
        location: { full: "/path/to/modules/tempvc/commands/create.ts" },
      } as any;
      const mockInteraction = { guildId: "G1" } as any;

      await precondition.chatInputRun(mockInteraction, mockCmd);
      expect(container.db.modules.isModuleEnabled).toHaveBeenCalledWith("G1", "tempvc");
    });
  });

  describe("NotIgnoredPrecondition", () => {
    const precondition = new NotIgnoredPrecondition(
      { name: "NotIgnored", path: "", root: "", store: {} as any } as any,
      {}
    );

    it("allows execution when outside guild (DM)", async () => {
      const mockInteraction = { guild: null } as any;
      const result = await precondition.chatInputRun(mockInteraction);
      expect(result.isOk()).toBe(true);
    });

    it("allows execution when server and channel are not ignored", async () => {
      (container.db.access.getIgnoreStatus as any).mockResolvedValue({
        guild: false,
        channel: false,
      });
      const mockMessage = { guild: { id: "G1" }, channelId: "C1" } as any;
      const result = await precondition.messageRun(mockMessage);
      expect(result.isOk()).toBe(true);
    });

    it("denies execution when guild is ignored", async () => {
      (container.db.access.getIgnoreStatus as any).mockResolvedValue({
        guild: true,
        channel: false,
      });
      const mockContext = { guild: { id: "G1" }, channelId: "C1" } as any;
      const result = await precondition.contextMenuRun(mockContext);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.unwrapErr().message).toBe("This server is not using Lumi.");
      }
    });

    it("denies execution when channel is ignored", async () => {
      (container.db.access.getIgnoreStatus as any).mockResolvedValue({
        guild: false,
        channel: true,
      });
      const mockInteraction = { guild: { id: "G1" }, channelId: "C1" } as any;
      const result = await precondition.chatInputRun(mockInteraction);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.unwrapErr().message).toBe("Commands are disabled in this channel.");
      }
    });
  });

  describe("MaintenanceModePrecondition", () => {
    const precondition = new MaintenanceModePrecondition(
      { name: "MaintenanceMode", path: "", root: "", store: {} as any } as any,
      {}
    );

    it("allows execution when maintenance mode is off", async () => {
      (container.db.global.getGlobalConfig as any).mockResolvedValue({
        maintenanceMode: false,
      });
      const mockInteraction = { user: { id: "user1" }, guild: { id: "G1" } } as any;
      const result = await precondition.chatInputRun(mockInteraction);
      expect(result.isOk()).toBe(true);
    });

    it("allows execution for bot owners even during maintenance mode", async () => {
      (container.db.global.getGlobalConfig as any).mockResolvedValue({
        maintenanceMode: true,
      });
      const mockMessage = { author: { id: "owner-999" }, guild: { id: "G1" } } as any;
      const result = await precondition.messageRun(mockMessage);
      expect(result.isOk()).toBe(true);
    });

    it("denies execution for regular users during maintenance mode with custom message", async () => {
      (container.db.global.getGlobalConfig as any).mockResolvedValue({
        maintenanceMode: true,
        maintenanceMessage: "System upgrading, back soon!",
      });
      const mockContextMenu = { user: { id: "user1" }, guild: null } as any;
      const result = await precondition.contextMenuRun(mockContextMenu);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.unwrapErr().message).toBe("System upgrading, back soon!");
      }
    });

    it("denies execution for regular users during maintenance mode with default message", async () => {
      (container.db.global.getGlobalConfig as any).mockResolvedValue({
        maintenanceMode: true,
        maintenanceMessage: null,
      });
      const mockInteraction = { user: { id: "user1" }, guild: { id: "G1" } } as any;
      const result = await precondition.chatInputRun(mockInteraction);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.unwrapErr().message).toContain("undergoing maintenance");
      }
    });
  });

  describe("NotBlockedPrecondition", () => {
    const precondition = new NotBlockedPrecondition(
      { name: "NotBlocked", path: "", root: "", store: {} as any } as any,
      {}
    );

    it("allows execution when user is not blocked", async () => {
      (container.db.access.isUserBlocked as any).mockResolvedValue(false);
      const mockInteraction = { user: { id: "good-user" }, guild: { id: "G1" } } as any;
      const result = await precondition.chatInputRun(mockInteraction);
      expect(result.isOk()).toBe(true);
    });

    it("denies execution when user is blocked", async () => {
      (container.db.access.isUserBlocked as any).mockResolvedValue(true);
      const mockMessage = { author: { id: "bad-user" }, guild: null } as any;
      const result = await precondition.messageRun(mockMessage);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.unwrapErr().message).toBe("You are not allowed to use this bot.");
      }

      const mockContextMenu = { user: { id: "bad-user" }, guild: { id: "G1" } } as any;
      const contextResult = await precondition.contextMenuRun(mockContextMenu);
      expect(contextResult.isErr()).toBe(true);
    });
  });
});

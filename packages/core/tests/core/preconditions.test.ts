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
import { PermitResolver } from "#lib/permissions/PermitResolver.js";

vi.mock("#lib/env.js", () => ({
  envParseString: vi.fn((_key: string, def = "") => def),
  envParseInteger: vi.fn(),
  envIsDefined: vi.fn(),
}));

function makeMockMessage(overrides: Record<string, unknown> = {}): any {
  return {
    guild: { id: "G1", ownerId: "owner-777" },
    author: { id: "user-1" },
    member: {
      roles: { cache: new Map() },
    },
    ...overrides,
  };
}

function makeMockInteraction(overrides: Record<string, unknown> = {}): any {
  return {
    guild: { id: "G1", ownerId: "owner-777" },
    user: { id: "user-1" },
    member: {
      roles: { cache: new Map() },
    },
    ...overrides,
  };
}

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
    (container as any).permitResolver = new PermitResolver();
    (container as any).client = { application: { owner: { id: "owner-999" } } };
  });

  describe("AdministratorPrecondition", () => {
    const precondition = new AdministratorPrecondition(
      { name: "Administrator", path: "", root: "", store: {} as any } as any,
      {}
    );

    it("allows execution when user has admin.* permit", async () => {
      const hasPermitSpy = vi.spyOn(container.permitResolver, "hasPermit").mockResolvedValue(true);

      const msgResult = await precondition.messageRun(makeMockMessage());
      expect(msgResult.isOk()).toBe(true);
      expect(hasPermitSpy).toHaveBeenCalledWith(
        expect.objectContaining({ permitNode: "admin.*" })
      );

      const interactionResult = await precondition.chatInputRun(makeMockInteraction());
      expect(interactionResult.isOk()).toBe(true);
    });

    it("denies execution when user lacks admin.* permit", async () => {
      vi.spyOn(container.permitResolver, "hasPermit").mockResolvedValue(false);

      const msgResult = await precondition.messageRun(makeMockMessage());
      expect(msgResult.isErr()).toBe(true);

      const interactionResult = await precondition.chatInputRun(makeMockInteraction());
      expect(interactionResult.isErr()).toBe(true);
    });
  });

  describe("BotOwnerPrecondition", () => {
    const precondition = new BotOwnerPrecondition(
      { name: "BotOwner", path: "", root: "", store: {} as any } as any,
      {}
    );

    it("allows execution when user is Bot Owner", async () => {
      vi.spyOn(PermitResolver, "isBotOwner").mockReturnValue(true);

      const msgResult = await precondition.messageRun(makeMockMessage());
      expect(msgResult.isOk()).toBe(true);
    });

    it("denies execution when user is not Bot Owner", async () => {
      vi.spyOn(PermitResolver, "isBotOwner").mockReturnValue(false);

      const msgResult = await precondition.messageRun(makeMockMessage());
      expect(msgResult.isErr()).toBe(true);

      const interactionResult = await precondition.chatInputRun(makeMockInteraction());
      expect(interactionResult.isErr()).toBe(true);
    });
  });

  describe("GuildOwnerPrecondition", () => {
    const precondition = new GuildOwnerPrecondition(
      { name: "GuildOwner", path: "", root: "", store: {} as any } as any,
      {}
    );

    it("allows execution when user is Guild Owner", async () => {
      const msgResult = await precondition.messageRun(makeMockMessage({ guild: { id: "G1", ownerId: "user-1" }, author: { id: "user-1" } }));
      expect(msgResult.isOk()).toBe(true);
    });

    it("denies execution when user is not Guild Owner", async () => {
      const msgResult = await precondition.messageRun(makeMockMessage());
      expect(msgResult.isErr()).toBe(true);
    });
  });

  describe("ModeratorPrecondition", () => {
    const precondition = new ModeratorPrecondition(
      { name: "Moderator", path: "", root: "", store: {} as any } as any,
      {}
    );

    it("allows execution when user has mod.* permit", async () => {
      vi.spyOn(container.permitResolver, "hasPermit").mockResolvedValue(true);

      const msgResult = await precondition.messageRun(makeMockMessage());
      expect(msgResult.isOk()).toBe(true);

      const interactionResult = await precondition.chatInputRun(makeMockInteraction());
      expect(interactionResult.isOk()).toBe(true);
    });

    it("denies execution when user lacks mod.* permit", async () => {
      vi.spyOn(container.permitResolver, "hasPermit").mockResolvedValue(false);

      const msgResult = await precondition.messageRun(makeMockMessage());
      expect(msgResult.isErr()).toBe(true);
    });
  });

  describe("ModuleEnabledPrecondition", () => {
    const precondition = new ModuleEnabledPrecondition(
      { name: "ModuleEnabled", path: "", root: "", store: {} as any } as any,
      {}
    );

    beforeEach(() => {
      (container as any).moduleStore = {
        isModuleDisableable: vi.fn().mockReturnValue(true),
        moduleNameForLocation: vi.fn().mockReturnValue(null),
      };
    });

    it("allows execution when module is enabled", async () => {
      (container as any).db.modules.isModuleEnabled = vi.fn().mockResolvedValue(true);
      const mockCmd = { options: { module: "afk" } } as any;
      const msgResult = await precondition.messageRun(makeMockMessage(), mockCmd);
      expect(msgResult.isOk()).toBe(true);
    });
  });

  describe("NotIgnoredPrecondition", () => {
    const precondition = new NotIgnoredPrecondition(
      { name: "NotIgnored", path: "", root: "", store: {} as any } as any,
      {}
    );

    it("denies execution when the guild is ignored", async () => {
      (container as any).db.access.getIgnoreStatus = vi
        .fn()
        .mockResolvedValue({ guild: true, channel: false });

      const result = await precondition.messageRun(makeMockMessage());
      expect(result.isErr()).toBe(true);
      expect(result.unwrapErr().message).toBe("This server is not using Lumi.");
    });

    it("denies execution when the channel is ignored", async () => {
      (container as any).db.access.getIgnoreStatus = vi
        .fn()
        .mockResolvedValue({ guild: false, channel: true });

      const result = await precondition.messageRun(makeMockMessage());
      expect(result.isErr()).toBe(true);
      expect(result.unwrapErr().message).toBe(
        "Commands are disabled in this channel."
      );
    });

    it("allows execution when neither guild nor channel is ignored", async () => {
      (container as any).db.access.getIgnoreStatus = vi
        .fn()
        .mockResolvedValue({ guild: false, channel: false });

      const msgResult = await precondition.messageRun(makeMockMessage());
      expect(msgResult.isOk()).toBe(true);

      const interactionResult = await precondition.chatInputRun(makeMockInteraction());
      expect(interactionResult.isOk()).toBe(true);
    });

    it("allows execution outside a guild without checking ignore status", async () => {
      const getIgnoreStatus = vi.fn().mockResolvedValue({ guild: false, channel: false });
      (container as any).db.access.getIgnoreStatus = getIgnoreStatus;

      const result = await precondition.messageRun(makeMockMessage({ guild: null }));
      expect(result.isOk()).toBe(true);
      expect(getIgnoreStatus).not.toHaveBeenCalled();
    });
  });

  describe("MaintenanceModePrecondition", () => {
    const precondition = new MaintenanceModePrecondition(
      { name: "MaintenanceMode", path: "", root: "", store: {} as any } as any,
      {}
    );

    it("allows execution when maintenance mode is off", async () => {
      const msgResult = await precondition.messageRun(makeMockMessage());
      expect(msgResult.isOk()).toBe(true);
    });

    it("allows Bot Owner during maintenance mode", async () => {
      (container as any).db.global.getGlobalConfig = vi.fn().mockResolvedValue({ maintenanceMode: true, maintenanceMessage: null });
      vi.spyOn(PermitResolver, "isBotOwner").mockReturnValue(true);

      const msgResult = await precondition.messageRun(makeMockMessage());
      expect(msgResult.isOk()).toBe(true);
    });
  });

  describe("NotBlockedPrecondition", () => {
    const precondition = new NotBlockedPrecondition(
      { name: "NotBlocked", path: "", root: "", store: {} as any } as any,
      {}
    );

    it("denies execution when the user is blocked", async () => {
      (container as any).db.access.isUserBlocked = vi.fn().mockResolvedValue(true);

      const result = await precondition.messageRun(makeMockMessage());
      expect(result.isErr()).toBe(true);
      expect(result.unwrapErr().message).toBe(
        "You are not allowed to use this bot."
      );
    });

    it("allows execution when the user is not blocked", async () => {
      (container as any).db.access.isUserBlocked = vi.fn().mockResolvedValue(false);

      const msgResult = await precondition.messageRun(makeMockMessage());
      expect(msgResult.isOk()).toBe(true);

      const interactionResult = await precondition.chatInputRun(makeMockInteraction());
      expect(interactionResult.isOk()).toBe(true);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "#lib/services.js";
import {
  preconditionChecks,
  type GateCheck,
  type GateSource,
} from "#lib/permissions/precondition-checks.js";
import { denyGated } from "#lib/commands.js";

vi.mock("#lib/utilities/command-response.js", () => ({
  handleDenied: vi.fn().mockResolvedValue(undefined),
  sendInteractionReply: vi.fn().mockResolvedValue(undefined),
}));

const { GuildOnly, BotOwner, LumiPermission, MaintenanceMode, ModuleEnabled } =
  preconditionChecks as Record<
    | "GuildOnly"
    | "BotOwner"
    | "LumiPermission"
    | "MaintenanceMode"
    | "ModuleEnabled",
    GateCheck
  >;

function source(overrides: Partial<GateSource> = {}): GateSource {
  return {
    userId: "user-1",
    guildId: "G1",
    guild: { id: "G1", ownerId: "owner-777" },
    member: { roles: { cache: new Map() } },
    channelId: "C1",
    ...overrides,
  };
}

describe("precondition gates", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (container as any).db = {
      global: {
        getGlobalConfig: vi.fn().mockResolvedValue({ maintenanceMode: false }),
      },
      modules: { isModuleEnabled: vi.fn().mockResolvedValue(true) },
      permissions: {
        getPermitChain: vi
          .fn()
          .mockResolvedValue({ tiers: [], isQuarantined: false }),
      },
    };
    (container as any).moduleStore = {
      isModuleDisableable: vi.fn().mockReturnValue(true),
      moduleNameForLocation: vi.fn().mockReturnValue(null),
    };
    (container as any).permitResolver = {
      hasPermit: vi.fn().mockResolvedValue(true),
    };
    (container as any).client = {};
    (container as any).logger = { error: vi.fn(), warn: vi.fn() };
  });

  it("exposes exactly the five supported gates", () => {
    expect(Object.keys(preconditionChecks).sort()).toEqual(
      [
        "BotOwner",
        "GuildOnly",
        "LumiPermission",
        "MaintenanceMode",
        "ModuleEnabled",
      ].sort(),
    );
  });

  describe("GuildOnly", () => {
    it("passes inside a guild", async () => {
      expect(await GuildOnly(source(), {})).toBeNull();
    });

    it("denies outside a guild", async () => {
      const denial = await GuildOnly(
        source({ guildId: null, guild: null }),
        {},
      );
      expect(denial).toMatchObject({ identifier: "preconditionGuildOnly" });
    });
  });

  describe("BotOwner", () => {
    it("passes for the application owner", async () => {
      (container as any).client = {
        application: { owner: { id: "user-1" } },
      };
      expect(await BotOwner(source(), {})).toBeNull();
    });

    it("denies anyone else", async () => {
      const denial = await BotOwner(source(), {});
      expect(denial).toMatchObject({ identifier: "PermissionDenied" });
    });
  });

  describe("LumiPermission", () => {
    it("passes when the command declares no permit node", async () => {
      expect(await LumiPermission(source(), {})).toBeNull();
    });

    it("denies outside a guild", async () => {
      const denial = await LumiPermission(
        source({ guildId: null, guild: null }),
        { requiredPermit: "mod.ban" },
      );
      expect(denial).toMatchObject({ identifier: "PermissionDenied" });
    });

    it("passes when the caller holds the node", async () => {
      (container as any).permitResolver.hasPermit = vi
        .fn()
        .mockResolvedValue(true);
      expect(
        await LumiPermission(source(), { requiredPermit: "mod.ban" }),
      ).toBeNull();
    });

    it("denies when the caller lacks the node", async () => {
      (container as any).permitResolver.hasPermit = vi
        .fn()
        .mockResolvedValue(false);
      const denial = await LumiPermission(source(), {
        requiredPermit: "mod.ban",
      });
      expect(denial?.message).toContain("mod.ban");
    });
  });

  describe("MaintenanceMode", () => {
    it("passes when maintenance mode is off", async () => {
      expect(await MaintenanceMode(source(), {})).toBeNull();
    });

    it("denies non-owners during maintenance", async () => {
      (container as any).db.global.getGlobalConfig = vi
        .fn()
        .mockResolvedValue({ maintenanceMode: true, maintenanceMessage: null });
      const denial = await MaintenanceMode(source(), {});
      expect(denial).toMatchObject({ identifier: "MaintenanceMode" });
    });

    it("lets the bot owner through during maintenance", async () => {
      (container as any).db.global.getGlobalConfig = vi
        .fn()
        .mockResolvedValue({ maintenanceMode: true, maintenanceMessage: null });
      (container as any).client = {
        application: { owner: { id: "user-1" } },
      };
      expect(await MaintenanceMode(source(), {})).toBeNull();
    });
  });

  describe("ModuleEnabled", () => {
    it("passes when the command declares no module", async () => {
      expect(await ModuleEnabled(source(), {})).toBeNull();
    });

    it("passes when the module cannot be disabled", async () => {
      (container as any).moduleStore.isModuleDisableable = vi
        .fn()
        .mockReturnValue(false);
      expect(await ModuleEnabled(source(), { module: "afk" })).toBeNull();
    });

    it("passes when the module is enabled", async () => {
      expect(await ModuleEnabled(source(), { module: "afk" })).toBeNull();
    });

    it("denies when the module is disabled", async () => {
      (container as any).db.modules.isModuleEnabled = vi
        .fn()
        .mockResolvedValue(false);
      const denial = await ModuleEnabled(source(), { module: "afk" });
      expect(denial).toMatchObject({ identifier: "ModuleEnabled" });
      expect(denial?.message).toContain("afk");
    });
  });

  describe("denyGated", () => {
    it("lets the run through when every gate passes", async () => {
      const { handleDenied } = await import(
        "#lib/utilities/command-response.js"
      );
      const passed = await denyGated(container, {} as any, source(), {
        names: ["MaintenanceMode", "ModuleEnabled"],
        command: { module: "afk" },
      });
      expect(passed).toBe(false);
      expect(handleDenied).not.toHaveBeenCalled();
    });

    it("stops on the first denial", async () => {
      const { handleDenied } = await import(
        "#lib/utilities/command-response.js"
      );
      const stopped = await denyGated(
        container,
        {} as any,
        source({ guildId: null, guild: null }),
        {
          names: ["MaintenanceMode", "GuildOnly"],
          command: {},
        },
      );
      expect(stopped).toBe(true);
      expect(handleDenied).toHaveBeenCalledTimes(1);
    });
  });
});

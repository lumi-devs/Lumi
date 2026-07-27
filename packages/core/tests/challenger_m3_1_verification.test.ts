import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { container } from "@sapphire/framework";
import { AdministratorPrecondition } from "#lib/permissions/preconditions/Administrator.js";
import { BotOwnerPrecondition } from "#lib/permissions/preconditions/BotOwner.js";
import { GuildOwnerPrecondition } from "#lib/permissions/preconditions/GuildOwner.js";
import { ModeratorPrecondition } from "#lib/permissions/preconditions/Moderator.js";
import { ModuleEnabledPrecondition } from "#lib/permissions/preconditions/ModuleEnabled.js";
import { NotIgnoredPrecondition } from "#lib/permissions/preconditions/NotIgnored.js";
import { MaintenanceModePrecondition } from "#lib/permissions/preconditions/MaintenanceMode.js";
import { NotBlockedPrecondition } from "#lib/permissions/preconditions/NotBlocked.js";
import { FilterMessageListener } from "#modules/filter/listeners/messageCreate.js";
import { compileRegexRules, compileRules, evaluate, type RuleConfig } from "#modules/filter/lib/rules.js";
import { ModuleCommand } from "#modules/core/commands/module.js";
import { WhoisCommand } from "#modules/utility/commands/whois.js";
import { ServerInfoCommand } from "#modules/utility/commands/serverinfo.js";
import { getAfkEntry, setAfkEntry, clearAfkEntry } from "#modules/afk/data/afk.js";
import { getService, tryGetService } from "#lib/module-system/Service.js";

vi.mock("#lib/module-system/Service.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getService: vi.fn(),
    tryGetService: vi.fn(),
  };
});

vi.mock("#lib/commands.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    sendReply: vi.fn().mockResolvedValue(undefined),
    fetchTyped: vi.fn().mockResolvedValue((key: string, opts?: any) => {
      if (opts) return `${key}:${JSON.stringify(opts)}`;
      return key;
    }),
  };
});

describe("Milestone 3 Challenger Verification Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Section 1: Preconditions Error Propagation & Boundary Testing", () => {
    beforeEach(() => {
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

    it("ModuleEnabledPrecondition propagates DB exception when container.db.modules throws", async () => {
      const precondition = new ModuleEnabledPrecondition(
        { name: "ModuleEnabled", path: "", root: "", store: {} as any } as any,
        {}
      );
      (container.db.modules.isModuleEnabled as any).mockRejectedValue(new Error("Database connection timeout"));

      const mockCmd = { options: { module: "filter" } } as any;
      const mockMsg = { guildId: "G1" } as any;

      await expect(precondition.messageRun(mockMsg, mockCmd)).rejects.toThrow("Database connection timeout");
    });

    it("NotIgnoredPrecondition propagates DB exception when container.db.access throws", async () => {
      const precondition = new NotIgnoredPrecondition(
        { name: "NotIgnored", path: "", root: "", store: {} as any } as any,
        {}
      );
      (container.db.access.getIgnoreStatus as any).mockRejectedValue(new Error("Prisma query failed"));

      const mockMsg = { guild: { id: "G1" }, channelId: "C1" } as any;
      await expect(precondition.messageRun(mockMsg)).rejects.toThrow("Prisma query failed");
    });

    it("MaintenanceModePrecondition propagates DB exception when global config query fails", async () => {
      const precondition = new MaintenanceModePrecondition(
        { name: "MaintenanceMode", path: "", root: "", store: {} as any } as any,
        {}
      );
      (container.db.global.getGlobalConfig as any).mockRejectedValue(new Error("Redis connection down"));

      const mockMsg = { author: { id: "user-1" }, guild: { id: "G1" } } as any;
      await expect(precondition.messageRun(mockMsg)).rejects.toThrow("Redis connection down");
    });

    it("NotBlockedPrecondition propagates DB exception when isUserBlocked fails", async () => {
      const precondition = new NotBlockedPrecondition(
        { name: "NotBlocked", path: "", root: "", store: {} as any } as any,
        {}
      );
      (container.db.access.isUserBlocked as any).mockRejectedValue(new Error("DB read error"));

      const mockMsg = { author: { id: "user-1" }, guild: null } as any;
      await expect(precondition.messageRun(mockMsg)).rejects.toThrow("DB read error");
    });

    it("ModuleEnabledPrecondition returns ok() for un-recognized command location when no module option set", async () => {
      const precondition = new ModuleEnabledPrecondition(
        { name: "ModuleEnabled", path: "", root: "", store: {} as any } as any,
        {}
      );
      const mockCmd = {
        options: {},
        location: { full: "/opt/custom_scripts/standalone_command.ts" },
      } as any;
      const mockMsg = { guildId: "G1" } as any;

      const result = await precondition.messageRun(mockMsg, mockCmd);
      expect(result.isOk()).toBe(true);
      expect(container.db.modules.isModuleEnabled).not.toHaveBeenCalled();
    });

    it("Verifies exact level boundary conditions for Administrator, BotOwner, GuildOwner, Moderator", async () => {
      const adminPrec = new AdministratorPrecondition({ name: "Administrator", path: "", root: "", store: {} as any } as any, {});
      const botOwnerPrec = new BotOwnerPrecondition({ name: "BotOwner", path: "", root: "", store: {} as any } as any, {});
      const guildOwnerPrec = new GuildOwnerPrecondition({ name: "GuildOwner", path: "", root: "", store: {} as any } as any, {});
      const modPrec = new ModeratorPrecondition({ name: "Moderator", path: "", root: "", store: {} as any } as any, {});

      // Admin user (perm level 8)
      const adminMsg = {
        userId: "admin-1",
        guild: { id: "G1", ownerId: "owner-777" },
        member: {
          roles: { cache: { has: () => false } },
          permissions: { has: (p: string) => p === "Administrator" },
        },
      } as any;

      expect((await adminPrec.messageRun(adminMsg)).isOk()).toBe(true);
      expect((await modPrec.messageRun(adminMsg)).isOk()).toBe(true);
      expect((await guildOwnerPrec.messageRun(adminMsg)).isErr()).toBe(true);
      expect((await botOwnerPrec.messageRun(adminMsg)).isErr()).toBe(true);
    });
  });

  describe("Section 2: Filter Listener & Rules Empirical Vulnerability Testing", () => {
    it("VULNERABILITY DEMO: empty string pattern in regexRules compiles to RegExp('', 'iu') which matches ALL text", () => {
      const compiled = compileRegexRules([""]);
      expect(compiled).toHaveLength(1);
      expect(compiled[0].source).toBe("(?:)");
      expect(compiled[0].test("Hello world!")).toBe(true);

      const baseConfig: RuleConfig = {
        terms: [],
        regexRules: [""], // Empty string rule!
        blockInvites: false,
        inviteAllowlist: [],
        blockLinks: false,
        linkAllowlist: [],
        maxMentions: 0,
        maxCapsPercent: 0,
        capsMinLength: 12,
      };
      const rules = compileRules(baseConfig);
      const hit = evaluate(rules, "Valid innocent message", 0);
      expect(hit).not.toBeNull();
      expect(hit?.rule).toBe("regex");
    });

    it("FilterMessageListener unhandled rejection if getService('config').getConfigList throws", async () => {
      const mockFilterService = {
        has: vi.fn().mockReturnValue(true),
        test: vi.fn().mockReturnValue({ rule: "badword", detail: "swear" }),
      };
      const mockConfigService = {
        getConfigList: vi.fn().mockRejectedValue(new Error("Config service unavailable")),
      };

      (getService as any).mockImplementation((name: string) => {
        if (name === "filter") return mockFilterService;
        if (name === "config") return mockConfigService;
        return null;
      });

      const listener = new FilterMessageListener(
        { name: "messageCreate", path: "", root: "", store: {} as any } as any,
        { module: "filter" } as any
      );

      const mockMessage = {
        guildId: "G1",
        member: { permissions: { has: vi.fn().mockReturnValue(false) } },
        mentions: { users: { size: 0 }, roles: { size: 0 } },
        content: "bad word message",
      };

      await expect((listener as any).handle(mockMessage)).rejects.toThrow("Config service unavailable");
    });
  });

  describe("Section 3: module.ts Subcommands & Update Multi-Module Error Handling", () => {
    let command: ModuleCommand;
    let mockDownloaderService: any;

    beforeEach(() => {
      (container as any).client = {
        options: { defaultCooldown: {} },
      };

      mockDownloaderService = {
        getInstalledModules: vi.fn().mockResolvedValue([
          { moduleName: "mod-a" },
          { moduleName: "mod-b" },
          { moduleName: "mod-c" },
        ]),
        updateModule: vi.fn(),
      };

      (getService as any).mockImplementation((svc: string) => {
        if (svc === "downloader") return mockDownloaderService;
        return null;
      });

      container.logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;

      command = new ModuleCommand(
        { name: "module", path: "", root: "", store: {} as any } as any,
        { prefixEnabled: true }
      );
    });

    it("runAllModulesUpdate continues updating remaining modules when one module fails", async () => {
      mockDownloaderService.updateModule
        .mockResolvedValueOnce({ updated: true, needsRestart: true }) // mod-a succeeds
        .mockRejectedValueOnce(new Error("Git merge conflict in mod-b")) // mod-b fails
        .mockResolvedValueOnce({ updated: false, needsRestart: false }); // mod-c skipped

      const replyFn = vi.fn().mockResolvedValue(undefined);
      await (command as any).runAllModulesUpdate(replyFn, "u-1");

      expect(mockDownloaderService.updateModule).toHaveBeenCalledTimes(3);
      expect(replyFn).toHaveBeenCalled();
      const cardArg = replyFn.mock.calls[0][0];
      const jsonStr = JSON.stringify(cardArg);
      expect(jsonStr).toContain("mod-a");
      expect(jsonStr).toContain("mod-b");
      expect(jsonStr).toContain("mod-c");
      expect(jsonStr).toContain("Git merge conflict in mod-b");
    });
  });

  describe("Section 4: whois, serverinfo, afk Edge Cases & Concurrency", () => {
    beforeEach(() => {
      (container as any).client = {
        options: { defaultCooldown: {} },
      };
    });

    it("ServerInfoCommand handles owner fetch rejection gracefully", async () => {
      const command = new ServerInfoCommand(
        { name: "serverinfo", path: "", root: "", store: {} as any } as any,
        {}
      );

      const mockGuild = {
        id: "G1",
        name: "Test Guild",
        createdAt: new Date(),
        memberCount: 10,
        premiumSubscriptionCount: 0,
        premiumTier: 0,
        verificationLevel: "NONE",
        iconURL: vi.fn().mockReturnValue(null),
        fetchOwner: vi.fn().mockRejectedValue(new Error("Owner not found / account deleted")),
        channels: { cache: { size: 4, filter: vi.fn().mockReturnValue({ size: 1 }) } },
        emojis: { cache: { size: 0 } },
        roles: { cache: { size: 2 } },
      };

      const mockCtx = { guild: mockGuild } as any;
      const mockT = (k: string) => k;

      // Note: if buildServerCard does not catch fetchOwner rejection, it will throw!
      await expect((command as any).buildServerCard(mockCtx, mockT)).rejects.toThrow("Owner not found / account deleted");
    });

    it("BUG CONFIRMATION: getAfkEntry returns corrupted object rather than null/error when Redis cache contains non-JSON string", async () => {
      (container as any).redis = {
        get: vi.fn().mockResolvedValue("invalid json content..."),
      };
      (container as any).db = {
        afk: {
          findEntry: vi.fn().mockResolvedValue({ guildId: "G1", userId: "U1", reason: "fallback DB", since: new Date() }),
        },
      };

      const result = await getAfkEntry("G1", "U1");
      // tryParseJSON returns the raw string "invalid json content..." on parse error.
      // typeof result is object because Javascript spreads string characters as keys!
      expect(typeof result).toBe("object");
      expect(isNaN((result as any).since.getTime())).toBe(true); // Invalid Date NaN!
    });
  });
});


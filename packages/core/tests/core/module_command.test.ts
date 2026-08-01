import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { ModuleCommand } from "#modules/core/commands/module.js";
import { ModuleAlreadyInstalledError } from "#lib/services/DownloaderService.js";

vi.mock("#lib/module-system/Service.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getService: vi.fn(),
  };
});

import { getService } from "#lib/module-system/Service.js";

/** Extracts the rendered text content of a CardReply (title + body) for content assertions. */
function cardText(card: any): string {
  return JSON.stringify(card.components[0].toJSON());
}

describe("ModuleCommand", () => {
  let command: ModuleCommand;
  let mockModuleStore: any;
  let mockDownloaderService: any;
  let mockStores: any;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockModuleStore = {
      all: vi.fn().mockReturnValue([
        {
          name: "afk",
          enabled: true,
          state: "loaded",
          failureReason: null,
          meta: {
            name: "afk",
            displayName: "AFK",
            emoji: "💤",
            version: "1.0.0",
            description: "AFK desc",
            isCore: false,
            dependencies: ["core"],
            conflicts: [],
            configFields: [{ key: "enabled", type: "boolean", description: "Enable AFK" }],
          },
        },
        {
          name: "mod",
          enabled: false,
          state: "failed",
          failureReason: "Missing dependency",
          meta: {
            name: "mod",
            displayName: "Moderation",
            emoji: "🛡️",
            version: "1.2.0",
            description: "Mod desc",
            isCore: true,
            dependencies: [],
            conflicts: [],
          },
        },
      ]),
      getRecord: vi.fn().mockImplementation((name: string) => {
        if (name === "afk") {
          return {
            name: "afk",
            enabled: true,
            state: "loaded",
            failureReason: null,
            meta: {
              name: "afk",
              displayName: "AFK",
              emoji: "💤",
              version: "1.0.0",
              description: "AFK desc",
              isCore: false,
              dependencies: ["core"],
              conflicts: [],
              configFields: [{ key: "enabled", type: "boolean", description: "Enable AFK" }],
            },
          };
        }
        if (name === "mod") {
          return {
            name: "mod",
            enabled: false,
            state: "failed",
            failureReason: "Missing dependency",
            meta: {
              name: "mod",
              displayName: "Moderation",
              emoji: "🛡️",
              version: "1.2.0",
              description: "Mod desc",
              isCore: true,
              dependencies: [],
              conflicts: [],
            },
          };
        }
        return null;
      }),
      setEnabled: vi.fn().mockResolvedValue(undefined),
      isModuleDisableable: vi.fn().mockImplementation((name: string) => {
        const rec = mockModuleStore.getRecord(name);
        if (!rec) return true;
        return rec.meta.disableable !== false;
      }),
      moduleNameForLocation: vi.fn().mockImplementation((path: string) => {
        if (path.includes("afk")) return "afk";
        if (path.includes("mod")) return "mod";
        return null;
      }),
      reload: vi.fn().mockResolvedValue(undefined),
    };

    mockDownloaderService = {
      installModule: vi.fn().mockResolvedValue(undefined),
      uninstallModule: vi.fn().mockResolvedValue(undefined),
      updateModule: vi.fn().mockResolvedValue({ updated: true, needsRestart: false }),
      syncApplicationCommands: vi.fn().mockResolvedValue(undefined),
      getInstalledModules: vi.fn().mockResolvedValue([]),
    };

    (getService as any).mockImplementation((svcName: string) => {
      if (svcName === "downloader") return mockDownloaderService;
      return null;
    });

    const mockCommandsStore = {
      name: "commands",
      values: vi.fn().mockReturnValue([
        { name: "afk_cmd", location: { full: "/path/to/modules/afk/commands/afk.ts" } },
        { name: "ban", location: { full: "/path/to/modules/mod/commands/ban.ts" } },
      ]),
    };

    const mockListenersStore = {
      name: "listeners",
      values: vi.fn().mockReturnValue([
        { name: "afk_listener", location: { full: "/path/to/modules/afk/listeners/afk.ts" } },
      ]),
    };

    mockStores = {
      get: vi.fn().mockImplementation((storeName: string) => {
        if (storeName === "commands") return mockCommandsStore;
        if (storeName === "listeners") return mockListenersStore;
        return null;
      }),
      values: vi.fn().mockReturnValue([mockCommandsStore, mockListenersStore]),
    };

    container.moduleStore = mockModuleStore as any;
    container.stores = mockStores as any;
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;
    (container as any).client = {
      options: {},
    } as any;

    command = new ModuleCommand(
      {
        name: "module",
        path: "/path/to/commands/module.ts",
        root: "/path/to/commands",
        store: { name: "commands" } as any,
      } as any,
      { prefixEnabled: true }
    );
  });

  function createMockCtx(overrides: Partial<any> = {}) {
    return {
      defer: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      getString: vi.fn().mockImplementation((key: string) => overrides[key] ?? null),
      isSlash: false,
      user: { id: "u-123", tag: "TestUser#0001" },
      source: {
        reply: vi.fn().mockResolvedValue({
          createMessageComponentCollector: vi.fn().mockReturnValue({ on: vi.fn() }),
        }),
      },
      ...overrides,
    };
  }

  it("should register application chat input subcommands", () => {
    const subNames: string[] = [];
    const makeSubBuilder = () => {
      const sub: any = {
        setName: vi.fn((n: string) => {
          subNames.push(n);
          return sub;
        }),
        setDescription: vi.fn().mockReturnThis(),
        addStringOption: vi.fn((cb: any) => {
          cb({
            setName: vi.fn().mockReturnThis(),
            setDescription: vi.fn().mockReturnThis(),
            setRequired: vi.fn().mockReturnThis(),
          });
          return sub;
        }),
      };
      return sub;
    };
    const mockBuilder = {
      setName: vi.fn().mockReturnThis(),
      setDescription: vi.fn().mockReturnThis(),
      addSubcommand: vi.fn((cb: any) => {
        cb(makeSubBuilder());
        return mockBuilder;
      }),
      setDefaultMemberPermissions: vi.fn().mockReturnThis(),
      setContexts: vi.fn().mockReturnThis(),
      setIntegrationTypes: vi.fn().mockReturnThis(),
    };
    const spy = vi.fn().mockImplementation((cb) => cb(mockBuilder));
    const mockRegistry = {
      registerChatInputCommand: spy,
    };

    command.registerApplicationCommands(mockRegistry as any);

    expect(spy).toHaveBeenCalled();
    expect(mockBuilder.addSubcommand).toHaveBeenCalledTimes(9);
    expect(subNames).toEqual([
      "list",
      "info",
      "enable",
      "disable",
      "reload",
      "install",
      "uninstall",
      "update",
      "help",
    ]);
  });

  describe("list subcommand", () => {
    it("should display message when no modules discovered", async () => {
      mockModuleStore.all.mockReturnValue([]);
      const ctx = createMockCtx();
      await command.list(ctx as any);
      expect(ctx.reply).toHaveBeenCalled();
    });

    it("should paginate list of discovered modules", async () => {
      const ctx = createMockCtx();
      await command.list(ctx as any);
      expect(ctx.source.reply).toHaveBeenCalled();
    });
  });

  describe("info subcommand", () => {
    it("should return detailed module info card", async () => {
      const ctx = createMockCtx({ module: "afk" });
      await command.info(ctx as any);
      expect(ctx.defer).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.objectContaining({ components: expect.any(Array) }));
    });

    it("should return error card if module not found", async () => {
      const ctx = createMockCtx({ module: "unknown" });
      await command.info(ctx as any);
      const text = cardText(ctx.reply.mock.calls[0]![0]);
      expect(text).toContain("Not Found");
      expect(text).toContain("Module **unknown** was not discovered.");
    });
  });

  describe("enable & disable subcommands", () => {
    it("should enable module globally", async () => {
      const ctx = createMockCtx({ module: "afk" });
      await command.enable(ctx as any);
      expect(mockModuleStore.setEnabled).toHaveBeenCalledWith("afk", true);
      expect(ctx.reply).toHaveBeenCalled();
    });

    it("should disable non-core module globally", async () => {
      const ctx = createMockCtx({ module: "afk" });
      await command.disable(ctx as any);
      expect(mockModuleStore.setEnabled).toHaveBeenCalledWith("afk", false);
      expect(ctx.reply).toHaveBeenCalled();
    });

    it("should prevent disabling non-disableable module", async () => {
      mockModuleStore.isModuleDisableable.mockReturnValueOnce(false);
      const ctx = createMockCtx({ module: "mod" });
      await command.disable(ctx as any);
      expect(mockModuleStore.setEnabled).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalled();
    });
  });

  describe("install subcommand", () => {
    it("should install third-party module successfully", async () => {
      const ctx = createMockCtx({ repo: "official", module: "economy", isSlash: false });
      await command.install(ctx as any);
      expect(ctx.reply).toHaveBeenCalledTimes(2); // Initial info card + success card
      expect(mockDownloaderService.installModule).toHaveBeenCalledWith("official", "economy");
    });

    it("should handle ModuleAlreadyInstalledError with update button option", async () => {
      mockDownloaderService.installModule.mockRejectedValue(new ModuleAlreadyInstalledError("economy"));
      const ctx = createMockCtx({ repo: "official", module: "economy", isSlash: true });
      await command.install(ctx as any);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          components: expect.arrayContaining([
            expect.objectContaining({
              toJSON: expect.any(Function),
            }),
          ]),
        })
      );
    });

    it("should handle generic install error", async () => {
      mockDownloaderService.installModule.mockRejectedValue(new Error("Git clone failed"));
      const ctx = createMockCtx({ repo: "official", module: "economy", isSlash: true });
      await command.install(ctx as any);
      expect(container.logger.warn).toHaveBeenCalled();
      const text = cardText(ctx.reply.mock.calls.at(-1)![0]);
      expect(text).toContain("Failed to Install Module");
      expect(text).toContain("Git clone failed");
    });
  });

  describe("uninstall subcommand", () => {
    it("should uninstall third-party module successfully", async () => {
      const ctx = createMockCtx({ module: "economy", isSlash: false });
      await command.uninstall(ctx as any);
      expect(mockDownloaderService.uninstallModule).toHaveBeenCalledWith("economy");
      expect(ctx.reply).toHaveBeenCalledTimes(2);
    });

    it("should handle uninstall failure", async () => {
      mockDownloaderService.uninstallModule.mockRejectedValue(new Error("Module not found on disk"));
      const ctx = createMockCtx({ module: "economy", isSlash: true });
      await command.uninstall(ctx as any);
      expect(container.logger.warn).toHaveBeenCalled();
      const text = cardText(ctx.reply.mock.calls.at(-1)![0]);
      expect(text).toContain("Failed to Uninstall Module");
      expect(text).toContain("Module not found on disk");
    });
  });

  describe("reload subcommand", () => {
    it("should reload module and re-sync slash commands", async () => {
      const ctx = createMockCtx({ module: "afk", isSlash: false });
      await command.reloadModuleCmd(ctx as any);
      expect(mockModuleStore.reload).toHaveBeenCalledWith("afk");
      expect(mockDownloaderService.syncApplicationCommands).toHaveBeenCalled();
      expect(container.logger.info).toHaveBeenCalled();
    });

    it("should handle reload error gracefully", async () => {
      mockModuleStore.reload.mockRejectedValue(new Error("Syntax error in module"));
      const ctx = createMockCtx({ module: "afk", isSlash: true });
      await command.reloadModuleCmd(ctx as any);
      expect(container.logger.warn).toHaveBeenCalled();
      const text = cardText(ctx.reply.mock.calls.at(-1)![0]);
      expect(text).toContain("Reload Failed");
      expect(text).toContain("Syntax error in module");
    });
  });

  describe("update subcommand", () => {
    it("should update single module when module parameter is passed", async () => {
      mockDownloaderService.updateModule.mockResolvedValue({ updated: true, needsRestart: true });
      const ctx = createMockCtx({ module: "afk", isSlash: false });
      await command.update(ctx as any);
      expect(mockDownloaderService.updateModule).toHaveBeenCalledWith("afk");
      expect(ctx.reply).toHaveBeenCalledTimes(2);
    });

    it("should handle error during single module update", async () => {
      mockDownloaderService.updateModule.mockRejectedValue(new Error("Network error"));
      const ctx = createMockCtx({ module: "afk", isSlash: true });
      await command.update(ctx as any);
      expect(ctx.reply).toHaveBeenCalled();
    });

    it("should update all modules when module parameter is omitted", async () => {
      mockDownloaderService.getInstalledModules.mockResolvedValue([
        { moduleName: "economy" },
        { moduleName: "music" },
        { moduleName: "levels" },
      ]);
      mockDownloaderService.updateModule
        .mockResolvedValueOnce({ updated: true, needsRestart: true }) // economy
        .mockResolvedValueOnce({ updated: false, needsRestart: false }) // music
        .mockRejectedValueOnce(new Error("Git pull failed")); // levels

      const ctx = createMockCtx({ module: null, isSlash: false });
      await command.update(ctx as any);

      expect(mockDownloaderService.updateModule).toHaveBeenCalledWith("economy");
      expect(mockDownloaderService.updateModule).toHaveBeenCalledWith("music");
      expect(mockDownloaderService.updateModule).toHaveBeenCalledWith("levels");
      expect(ctx.reply).toHaveBeenCalledTimes(2);
    });

    it("should warn when no third-party modules are installed for multi-update", async () => {
      mockDownloaderService.getInstalledModules.mockResolvedValue([]);
      const ctx = createMockCtx({ module: null, isSlash: true });
      await command.update(ctx as any);
      const text = cardText(ctx.reply.mock.calls.at(-1)![0]);
      expect(text).toContain("No Modules Installed");
      expect(text).toContain("You have not installed any third-party modules via the Downloader.");
    });

    it("should handle error in runAllModulesUpdate when getInstalledModules fails", async () => {
      mockDownloaderService.getInstalledModules.mockRejectedValue(new Error("Database offline"));
      const ctx = createMockCtx({ module: null, isSlash: true });
      await command.update(ctx as any);
      const text = cardText(ctx.reply.mock.calls.at(-1)![0]);
      expect(text).toContain("Multi-Update Failed");
      expect(text).toContain("Database offline");
    });
  });

  describe("help subcommand", () => {
    it("should reply with help card and action row panel buttons", async () => {
      const ctx = createMockCtx();
      await command.help(ctx as any);
      expect(ctx.defer).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          components: expect.arrayContaining([
            expect.objectContaining({
              toJSON: expect.any(Function),
            }),
          ]),
        })
      );
    });
  });
});

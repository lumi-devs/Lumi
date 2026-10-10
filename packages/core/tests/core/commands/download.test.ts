import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@lumi/lib/services.js";
import { CommandContext } from "@lumi/lib/commands/context.js";
import { asHandler } from "@lumi/lib/commands/command-def.js";
import { downloadDef } from "@lumi/modules/core/commands/download.js";
import { PermitResolver } from "@lumi/lib/permissions/permit-resolver.js";

vi.mock("@lumi/lib/module-system/utility.js", () => ({
  getUtility: vi.fn(),
  tryGetUtility: vi.fn(),
}));

vi.mock("@lumi/lib/utilities/confirm.js", () => ({
  confirmPrompt: vi.fn().mockResolvedValue({ confirmed: true, message: {} }),
}));

vi.mock("@lumi/lib/i18n/index.js", () => ({
  fetchT: vi.fn().mockResolvedValue((key: string) => key),
  fetchTyped: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("@lumi/lib/utilities/command-response.js", () => ({
  sendInteractionReply: vi.fn().mockResolvedValue(undefined),
}));

import { getUtility } from "@lumi/lib/module-system/utility.js";
import { sendInteractionReply } from "@lumi/lib/utilities/command-response.js";

function makeServices() {
  return {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  } as any;
}

function slashCtx(options: Record<string, unknown>, services: any) {
  const interaction = {
    user: { id: "u-1", tag: "Tester#0001" },
    guildId: "g-1",
    deferred: false,
    replied: false,
    deferReply: vi.fn().mockResolvedValue(undefined),
    options: {
      getString: vi.fn().mockImplementation((name: string) => options[name] ?? null),
    },
  } as any;
  return CommandContext.fromInteraction(interaction, services);
}

function lastCardJson() {
  const calls = (sendInteractionReply as any).mock.calls;
  return JSON.stringify(calls[calls.length - 1][1]);
}

function runHandler(name: "panel" | "install" | "uninstall" | "rollback", ctx: CommandContext) {
  return asHandler(downloadDef.handlers![name]!).run(ctx);
}

describe("downloadDef", () => {
  let downloader: any;
  let services: any;

  beforeEach(() => {
    vi.clearAllMocks();
    services = makeServices();
    downloader = {
      installModule: vi.fn().mockResolvedValue(undefined),
      uninstallModule: vi.fn().mockResolvedValue(undefined),
      rollbackModule: vi.fn().mockResolvedValue({ commit: "abc1234" }),
      listRepos: vi.fn().mockResolvedValue([]),
      getModulesInRepo: vi.fn().mockResolvedValue([]),
      getInstalledModules: vi.fn().mockResolvedValue([]),
    };
    (getUtility as any).mockReturnValue(downloader);
    vi.spyOn(PermitResolver, "isBotOwner").mockReturnValue(true);
    container.logger = services.logger;
  });

  describe("panel", () => {
    it("replies with a card carrying the add-ons manager button", async () => {
      const ctx = slashCtx({}, services);

      await runHandler("panel", ctx);

      expect(lastCardJson()).toContain("lumi:tab:addons");
    });
  });

  describe("install", () => {
    it("installs the requested module from the requested repo", async () => {
      const ctx = slashCtx({ repo: "official", module: "economy" }, services);

      await runHandler("install", ctx);

      expect(downloader.installModule).toHaveBeenCalledWith(
        services,
        "official",
        "economy",
        undefined,
      );
      expect(lastCardJson()).toContain("core:moduleInstalledTitle");
    });

    it("forwards an explicit revision", async () => {
      const ctx = slashCtx({ repo: "official", module: "economy", revision: "v1.2.3" }, services);

      await runHandler("install", ctx);

      expect(downloader.installModule).toHaveBeenCalledWith(
        services,
        "official",
        "economy",
        "v1.2.3",
      );
    });

    it("reports the failure reason and warns when the install throws", async () => {
      downloader.installModule.mockRejectedValue(new Error("Manifest validation failed"));
      const ctx = slashCtx({ repo: "official", module: "economy" }, services);

      await runHandler("install", ctx);

      expect(lastCardJson()).toContain("Manifest validation failed");
      expect(services.logger.warn).toHaveBeenCalled();
    });
  });

  describe("uninstall", () => {
    it("uninstalls the named module and confirms", async () => {
      const ctx = slashCtx({ module: "economy" }, services);

      await runHandler("uninstall", ctx);

      expect(downloader.uninstallModule).toHaveBeenCalledWith(services, "economy");
      expect(lastCardJson()).toContain("core:moduleUninstalledTitle");
    });

    it("reports the failure reason when the uninstall throws", async () => {
      downloader.uninstallModule.mockRejectedValue(new Error("Module is pinned"));
      const ctx = slashCtx({ module: "economy" }, services);

      await runHandler("uninstall", ctx);

      expect(lastCardJson()).toContain("Module is pinned");
    });
  });

  describe("rollback", () => {
    it("checks the module out at the requested revision", async () => {
      const ctx = slashCtx({ module: "economy", revision: "v1.0.0" }, services);

      await runHandler("rollback", ctx);

      expect(downloader.rollbackModule).toHaveBeenCalledWith(services, "economy", "v1.0.0");
      expect(lastCardJson()).toContain("core:moduleRolledBackTitle");
    });

    it("reports the failure reason when the checkout throws", async () => {
      downloader.rollbackModule.mockRejectedValue(new Error("Unknown revision"));
      const ctx = slashCtx({ module: "economy", revision: "nope" }, services);

      await runHandler("rollback", ctx);

      expect(lastCardJson()).toContain("Unknown revision");
      expect(services.logger.warn).toHaveBeenCalled();
    });
  });

  describe("autocomplete", () => {
    function autocompleteInteraction(focusedName: string, subcommand: string | null = null, focusedValue = "", repoOption: string | null = null) {
      return {
        user: { id: "owner-1" },
        respond: vi.fn().mockResolvedValue(undefined),
        options: {
          getFocused: vi.fn().mockReturnValue({ name: focusedName, value: focusedValue }),
          getSubcommand: vi.fn().mockReturnValue(subcommand),
          getString: vi.fn().mockReturnValue(repoOption),
        },
      } as any;
    }

    it("suggests installed modules when uninstalling", async () => {
      downloader.getInstalledModules.mockResolvedValue([
        { moduleName: "economy" },
        { moduleName: "music" },
      ]);

      await downloadDef.autocomplete!(services, autocompleteInteraction("module", "uninstall"));

      expect(downloader.getInstalledModules).toHaveBeenCalled();
    });

    it("filters installed modules by what the user typed", async () => {
      downloader.getInstalledModules.mockResolvedValue([
        { moduleName: "economy" },
        { moduleName: "music" },
      ]);

      const interaction = autocompleteInteraction("module", "uninstall", "eco");
      await downloadDef.autocomplete!(services, interaction);

      expect(interaction.respond).toHaveBeenCalledWith([{ name: "economy", value: "economy" }]);
    });
  });
});

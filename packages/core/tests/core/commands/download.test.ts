import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { DownloadCommand } from "#modules/core/commands/download.js";

vi.mock("#lib/module-system/Utility.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, getUtility: vi.fn() };
});

vi.mock("#lib/utilities/confirm.js", () => ({
  confirmPrompt: vi.fn().mockResolvedValue({ confirmed: true, message: {} }),
}));

vi.mock("#lib/utilities/autocomplete.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, respondWithChoices: vi.fn().mockResolvedValue(undefined) };
});

import { getUtility } from "#lib/module-system/Utility.js";
import { respondWithChoices } from "#lib/utilities/autocomplete.js";

describe("DownloadCommand", () => {
  let command: DownloadCommand;
  let downloader: any;

  beforeEach(() => {
    vi.clearAllMocks();

    downloader = {
      installModule: vi.fn().mockResolvedValue(undefined),
      uninstallModule: vi.fn().mockResolvedValue(undefined),
      rollbackModule: vi.fn().mockResolvedValue({ commit: "abc1234" }),
      listRepos: vi.fn().mockResolvedValue([]),
      getModulesInRepo: vi.fn().mockResolvedValue([]),
      getInstalledModules: vi.fn().mockResolvedValue([]),
    };

    (getUtility as any).mockImplementation((name: string) =>
      name === "downloader" ? downloader : null,
    );

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;
    (container as any).client = { options: {} };

    command = new DownloadCommand(
      {
        name: "download",
        path: "/path/to/commands/download.ts",
        root: "/path/to/commands",
        store: { name: "commands" } as any,
      },
      { prefixEnabled: true },
    );
  });

  function createMockCtx(options: Record<string, unknown> = {}) {
    return {
      isSlash: false,
      user: { id: "u-1", tag: "Tester#0001" },
      source: {},
      fetchT: vi.fn().mockResolvedValue((key: string) => key),
      getString: vi
        .fn()
        .mockImplementation((key: string) => options[key] ?? null),
      reply: vi.fn().mockResolvedValue(undefined),
      replyInfo: vi.fn().mockResolvedValue(undefined),
      replySuccess: vi.fn().mockResolvedValue(undefined),
      replyError: vi.fn().mockResolvedValue(undefined),
    };
  }

  describe("panel", () => {
    it("replies with a card carrying the add-ons manager button", async () => {
      const ctx = createMockCtx();

      await command.panel(ctx as any);

      const card = ctx.reply.mock.calls[0]![0];
      expect(JSON.stringify(card.components[0].toJSON())).toContain(
        "lumi:tab:addons",
      );
    });
  });

  describe("install", () => {
    it("installs the requested module from the requested repo", async () => {
      const ctx = createMockCtx({ repo: "official", module: "economy" });

      await command.install(ctx as any);

      expect(downloader.installModule).toHaveBeenCalledWith(
        "official",
        "economy",
        undefined,
      );
      expect(ctx.replySuccess).toHaveBeenCalled();
    });

    it("forwards an explicit revision", async () => {
      const ctx = createMockCtx({
        repo: "official",
        module: "economy",
        revision: "v1.2.3",
      });

      await command.install(ctx as any);

      expect(downloader.installModule).toHaveBeenCalledWith(
        "official",
        "economy",
        "v1.2.3",
      );
    });

    it("reports the failure reason and warns when the install throws", async () => {
      downloader.installModule.mockRejectedValue(
        new Error("Manifest validation failed"),
      );
      const ctx = createMockCtx({ repo: "official", module: "economy" });

      await command.install(ctx as any);

      expect(ctx.replySuccess).not.toHaveBeenCalled();
      expect(ctx.replyError).toHaveBeenCalledWith(
        expect.any(String),
        "Manifest validation failed",
      );
      expect(container.logger.warn).toHaveBeenCalled();
    });
  });

  describe("uninstall", () => {
    it("uninstalls the named module and confirms", async () => {
      const ctx = createMockCtx({ module: "economy" });

      await command.uninstall(ctx as any);

      expect(downloader.uninstallModule).toHaveBeenCalledWith("economy");
      expect(ctx.replySuccess).toHaveBeenCalled();
    });

    it("reports the failure reason when the uninstall throws", async () => {
      downloader.uninstallModule.mockRejectedValue(
        new Error("Module is pinned"),
      );
      const ctx = createMockCtx({ module: "economy" });

      await command.uninstall(ctx as any);

      expect(ctx.replyError).toHaveBeenCalledWith(
        expect.any(String),
        "Module is pinned",
      );
    });
  });

  describe("rollback", () => {
    it("checks the module out at the requested revision", async () => {
      const ctx = createMockCtx({ module: "economy", revision: "v1.0.0" });

      await command.rollback(ctx as any);

      expect(downloader.rollbackModule).toHaveBeenCalledWith(
        "economy",
        "v1.0.0",
      );
      expect(ctx.replySuccess).toHaveBeenCalled();
    });

    it("reports the resolved commit returned by the downloader", async () => {
      const ctx = createMockCtx({ module: "economy", revision: "v1.0.0" });

      await command.rollback(ctx as any);

      expect(container.logger.info).toHaveBeenCalledWith(
        expect.stringContaining("abc1234"),
      );
    });

    it("falls back to the requested revision when no commit is resolved", async () => {
      downloader.rollbackModule.mockResolvedValue({ commit: null });
      const ctx = createMockCtx({ module: "economy", revision: "v1.0.0" });

      await command.rollback(ctx as any);

      expect(container.logger.info).toHaveBeenCalledWith(
        expect.stringContaining("unknown"),
      );
      expect(ctx.replySuccess).toHaveBeenCalled();
    });

    it("reports the failure reason when the checkout throws", async () => {
      downloader.rollbackModule.mockRejectedValue(
        new Error("Unknown revision"),
      );
      const ctx = createMockCtx({ module: "economy", revision: "nope" });

      await command.rollback(ctx as any);

      expect(ctx.replyError).toHaveBeenCalledWith(
        expect.any(String),
        "Unknown revision",
      );
      expect(container.logger.warn).toHaveBeenCalled();
    });
  });

  describe("autocompleteRun", () => {
    function autocompleteInteraction(
      focusedName: string,
      subcommand: string | null = null,
      focusedValue = "",
      repoOption: string | null = null,
    ) {
      return {
        options: {
          getFocused: vi
            .fn()
            .mockReturnValue({ name: focusedName, value: focusedValue }),
          getSubcommand: vi.fn().mockReturnValue(subcommand),
          getString: vi.fn().mockReturnValue(repoOption),
        },
      } as any;
    }

    it("suggests repo names for the repo option", async () => {
      downloader.listRepos.mockResolvedValue([
        { name: "official" },
        { name: "community" },
      ]);

      await command.autocompleteRun(autocompleteInteraction("repo", "install"));

      expect(respondWithChoices).toHaveBeenCalledWith(expect.anything(), [
        "official",
        "community",
      ]);
    });

    it("returns no choices for an unrelated option", async () => {
      await command.autocompleteRun(
        autocompleteInteraction("revision", "install"),
      );

      expect(respondWithChoices).toHaveBeenCalledWith(expect.anything(), []);
      expect(downloader.listRepos).not.toHaveBeenCalled();
    });

    it("suggests not-yet-installed repo modules when installing", async () => {
      downloader.getModulesInRepo.mockResolvedValue([
        { name: "economy", hidden: false },
        { name: "music", hidden: false },
        { name: "internal", hidden: true },
      ]);
      downloader.getInstalledModules.mockResolvedValue([
        { moduleName: "music" },
      ]);

      await command.autocompleteRun(
        autocompleteInteraction("module", "install", "", "official"),
      );

      expect(respondWithChoices).toHaveBeenCalledWith(expect.anything(), [
        "economy",
      ]);
    });

    it("suggests installed modules when uninstalling", async () => {
      downloader.getInstalledModules.mockResolvedValue([
        { moduleName: "economy" },
        { moduleName: "music" },
      ]);

      await command.autocompleteRun(
        autocompleteInteraction("module", "uninstall"),
      );

      expect(respondWithChoices).toHaveBeenCalledWith(expect.anything(), [
        "economy",
        "music",
      ]);
      expect(downloader.getModulesInRepo).not.toHaveBeenCalled();
    });

    it("suggests installed modules when rolling back", async () => {
      downloader.getInstalledModules.mockResolvedValue([
        { moduleName: "economy" },
      ]);

      await command.autocompleteRun(
        autocompleteInteraction("module", "rollback"),
      );

      expect(respondWithChoices).toHaveBeenCalledWith(expect.anything(), [
        "economy",
      ]);
    });
  });
});

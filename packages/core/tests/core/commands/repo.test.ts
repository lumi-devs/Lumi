import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { RepoCommand } from "#modules/core/commands/repo.js";

vi.mock("#lib/module-system/Utility.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, getUtility: vi.fn() };
});

vi.mock("#lib/utilities/pagination.js", () => ({
  paginateContainer: vi.fn().mockResolvedValue(undefined),
  paginateList: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("#lib/utilities/confirm.js", () => ({
  confirmPrompt: vi.fn().mockResolvedValue({ confirmed: true, message: {} }),
}));

vi.mock("#lib/utilities/autocomplete.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, respondWithChoices: vi.fn().mockResolvedValue(undefined) };
});

import { getUtility } from "#lib/module-system/Utility.js";
import { paginateList } from "#lib/utilities/pagination.js";
import { respondWithChoices } from "#lib/utilities/autocomplete.js";

describe("RepoCommand", () => {
  let command: RepoCommand;
  let downloader: any;

  beforeEach(() => {
    vi.clearAllMocks();

    downloader = {
      addRepo: vi.fn().mockResolvedValue(undefined),
      removeRepo: vi.fn().mockResolvedValue(undefined),
      updateRepo: vi.fn().mockResolvedValue(undefined),
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

    command = new RepoCommand(
      {
        name: "repo",
        path: "/path/to/commands/repo.ts",
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

  describe("add", () => {
    it("derives the repo name from the URL when none is supplied", async () => {
      const ctx = createMockCtx({
        url: "https://github.com/lumi-devs/addons.git",
      });

      await command.add(ctx as any);

      expect(downloader.addRepo).toHaveBeenCalledWith(
        "addons",
        "https://github.com/lumi-devs/addons.git",
        "default",
      );
    });

    it("prefers an explicitly supplied name over the derived one", async () => {
      const ctx = createMockCtx({
        url: "https://github.com/lumi-devs/addons.git",
        name: "custom",
      });

      await command.add(ctx as any);

      expect(downloader.addRepo).toHaveBeenCalledWith(
        "custom",
        "https://github.com/lumi-devs/addons.git",
        "default",
      );
    });

    it("passes through an explicit branch", async () => {
      const ctx = createMockCtx({
        url: "git@github.com:lumi-devs/addons.git",
        branch: "next",
      });

      await command.add(ctx as any);

      expect(downloader.addRepo).toHaveBeenCalledWith(
        "addons",
        "git@github.com:lumi-devs/addons.git",
        "next",
      );
    });

    it("reports success and logs once the repo is cloned", async () => {
      const ctx = createMockCtx({ url: "https://github.com/o/r" });

      await command.add(ctx as any);

      expect(ctx.replySuccess).toHaveBeenCalled();
      expect(ctx.replyError).not.toHaveBeenCalled();
      expect(container.logger.info).toHaveBeenCalled();
    });

    it("surfaces the clone failure message without adding the repo", async () => {
      downloader.addRepo.mockRejectedValue(new Error("Git clone failed"));
      const ctx = createMockCtx({ url: "https://github.com/o/r" });

      await command.add(ctx as any);

      expect(ctx.replySuccess).not.toHaveBeenCalled();
      expect(ctx.replyError).toHaveBeenCalledWith(
        expect.any(String),
        "Git clone failed",
      );
      expect(container.logger.warn).toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("removes the named repo and confirms", async () => {
      const ctx = createMockCtx({ name: "addons" });

      await command.remove(ctx as any);

      expect(downloader.removeRepo).toHaveBeenCalledWith("addons");
      expect(ctx.replySuccess).toHaveBeenCalled();
    });

    it("reports the failure reason when removal throws", async () => {
      downloader.removeRepo.mockRejectedValue(new Error("Repo not found"));
      const ctx = createMockCtx({ name: "ghost" });

      await command.remove(ctx as any);

      expect(ctx.replyError).toHaveBeenCalledWith(
        expect.any(String),
        "Repo not found",
      );
      expect(ctx.replySuccess).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("pulls the named repo and confirms", async () => {
      const ctx = createMockCtx({ name: "addons" });

      await command.update(ctx as any);

      expect(downloader.updateRepo).toHaveBeenCalledWith("addons");
      expect(ctx.replySuccess).toHaveBeenCalled();
    });

    it("reports the failure reason and warns when the pull throws", async () => {
      downloader.updateRepo.mockRejectedValue(new Error("Network unreachable"));
      const ctx = createMockCtx({ name: "addons" });

      await command.update(ctx as any);

      expect(ctx.replyError).toHaveBeenCalledWith(
        expect.any(String),
        "Network unreachable",
      );
      expect(container.logger.warn).toHaveBeenCalled();
    });
  });

  describe("list", () => {
    it("reports an empty state when no repos are registered", async () => {
      const ctx = createMockCtx();

      await command.list(ctx as any);

      expect(ctx.replyError).toHaveBeenCalled();
      expect(paginateList).not.toHaveBeenCalled();
    });

    it("paginates the repos with their branch and URL", async () => {
      downloader.listRepos.mockResolvedValue([
        { name: "addons", branch: "main", url: "https://github.com/o/addons" },
        { name: "extra", branch: "dev", url: "https://github.com/o/extra" },
      ]);
      const ctx = createMockCtx();

      await command.list(ctx as any);

      const opts = (paginateList as any).mock.calls[0][0];
      expect(opts.items).toEqual([
        "**addons** (`main`)\n<https://github.com/o/addons>",
        "**extra** (`dev`)\n<https://github.com/o/extra>",
      ]);
      expect(opts.userId).toBe("u-1");
    });
  });

  describe("modules", () => {
    it("reports an empty state when the repo exposes no modules", async () => {
      const ctx = createMockCtx({ repo_name: "addons" });

      await command.modules(ctx as any);

      expect(ctx.replyError).toHaveBeenCalled();
      expect(paginateList).not.toHaveBeenCalled();
    });

    it("omits hidden modules from the listing", async () => {
      downloader.getModulesInRepo.mockResolvedValue([
        { name: "economy", version: "1.0.0", short: "Economy", hidden: false },
        { name: "internal", version: "0.1.0", short: "Internal", hidden: true },
      ]);
      const ctx = createMockCtx({ repo_name: "addons" });

      await command.modules(ctx as any);

      const opts = (paginateList as any).mock.calls[0][0];
      expect(opts.items).toHaveLength(1);
      expect(opts.items[0]).toContain("economy");
    });

    it("badges modules that are already installed", async () => {
      downloader.getModulesInRepo.mockResolvedValue([
        { name: "economy", version: "1.0.0", short: "Economy", hidden: false },
        { name: "music", version: "2.0.0", short: "Music", hidden: false },
      ]);
      downloader.getInstalledModules.mockResolvedValue([
        { moduleName: "economy" },
      ]);
      const ctx = createMockCtx({ repo_name: "addons" });

      await command.modules(ctx as any);

      const opts = (paginateList as any).mock.calls[0][0];
      expect(opts.items[0]).toContain("core:installedBadge");
      expect(opts.items[1]).not.toContain("core:installedBadge");
    });

    it("reports the failure reason when the repo cannot be read", async () => {
      downloader.getModulesInRepo.mockRejectedValue(
        new Error("Repo directory missing"),
      );
      const ctx = createMockCtx({ repo_name: "addons" });

      await command.modules(ctx as any);

      expect(ctx.replyError).toHaveBeenCalledWith(
        expect.any(String),
        "Repo directory missing",
      );
    });
  });

  describe("autocompleteRun", () => {
    function autocompleteInteraction(
      focusedName: string,
      subcommand: string | null = null,
      focusedValue = "",
    ) {
      return {
        options: {
          getFocused: vi
            .fn()
            .mockReturnValue({ name: focusedName, value: focusedValue }),
          getSubcommand: vi.fn().mockReturnValue(subcommand),
        },
      } as any;
    }

    it("returns no choices for an unrelated option", async () => {
      await command.autocompleteRun(autocompleteInteraction("branch"));

      expect(respondWithChoices).toHaveBeenCalledWith(expect.anything(), []);
      expect(downloader.listRepos).not.toHaveBeenCalled();
    });

    it("suggests the registered repo names for the name option", async () => {
      downloader.listRepos.mockResolvedValue([
        { name: "addons" },
        { name: "extra" },
      ]);

      await command.autocompleteRun(autocompleteInteraction("name", "remove"));

      expect(respondWithChoices).toHaveBeenCalledWith(expect.anything(), [
        "addons",
        "extra",
      ]);
    });

    it("offers the all shorthand only on the update subcommand", async () => {
      downloader.listRepos.mockResolvedValue([{ name: "addons" }]);

      await command.autocompleteRun(autocompleteInteraction("name", "update"));

      expect(respondWithChoices).toHaveBeenCalledWith(expect.anything(), [
        "addons",
        "all",
      ]);
    });

    it("does not offer the all shorthand for the repo_name option", async () => {
      downloader.listRepos.mockResolvedValue([{ name: "addons" }]);

      await command.autocompleteRun(
        autocompleteInteraction("repo_name", "modules"),
      );

      expect(respondWithChoices).toHaveBeenCalledWith(expect.anything(), [
        "addons",
      ]);
    });

    it("filters the suggestions by what the user has typed", async () => {
      downloader.listRepos.mockResolvedValue([
        { name: "addons" },
        { name: "extra" },
      ]);

      await command.autocompleteRun(
        autocompleteInteraction("name", "remove", "ext"),
      );

      expect(respondWithChoices).toHaveBeenCalledWith(expect.anything(), [
        "extra",
      ]);
    });
  });
});

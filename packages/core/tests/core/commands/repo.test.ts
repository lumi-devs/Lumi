import { describe, it, expect, vi, beforeEach } from "bun:test";
import { CommandContext } from "@lumi/lib/commands/context.js";
import { asHandler } from "@lumi/lib/commands/command-def.js";
import { repoDef } from "@lumi/modules/core/commands/repo.js";

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

vi.mock("@lumi/lib/utilities/pagination.js", () => ({
  paginateContainer: vi.fn().mockResolvedValue(undefined),
  paginateList: vi.fn().mockResolvedValue(undefined),
}));

import { getUtility } from "@lumi/lib/module-system/utility.js";
import { sendInteractionReply } from "@lumi/lib/utilities/command-response.js";
import { paginateList } from "@lumi/lib/utilities/pagination.js";

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

function runHandler(name: "add" | "remove" | "update" | "list" | "modules" | "help", ctx: CommandContext) {
  return asHandler(repoDef.handlers![name]!).run(ctx);
}

function lastCardJson() {
  const calls = (sendInteractionReply as any).mock.calls;
  return JSON.stringify(calls[calls.length - 1][1]);
}

describe("repoDef", () => {
  let downloader: any;
  let services: any;

  beforeEach(() => {
    vi.clearAllMocks();
    services = makeServices();
    downloader = {
      addRepo: vi.fn().mockResolvedValue({ sha: "abc123", signedBy: null, signatureWarning: null }),
      removeRepo: vi.fn().mockResolvedValue(undefined),
      updateRepo: vi.fn().mockResolvedValue({
        oldSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        newSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        changed: true,
        diffStat: "1 file changed",
        recloned: false,
      }),
      listRepos: vi.fn().mockResolvedValue([]),
      getModulesInRepo: vi.fn().mockResolvedValue([]),
      getInstalledModules: vi.fn().mockResolvedValue([]),
    };
    (getUtility as any).mockReturnValue(downloader);
  });

  describe("add", () => {
    it("derives the repo name from the URL when none is supplied", async () => {
      const ctx = slashCtx({ url: "https://github.com/lumi-devs/addons.git" }, services);

      await runHandler("add", ctx);

      expect(downloader.addRepo).toHaveBeenCalledWith(
        services,
        "addons",
        "https://github.com/lumi-devs/addons.git",
        "default",
      );
    });

    it("prefers an explicitly supplied name and branch", async () => {
      const ctx = slashCtx({
        url: "https://github.com/lumi-devs/addons.git",
        name: "custom",
        branch: "next",
      }, services);

      await runHandler("add", ctx);

      expect(downloader.addRepo).toHaveBeenCalledWith(
        services,
        "custom",
        "https://github.com/lumi-devs/addons.git",
        "next",
      );
    });

    it("surfaces the clone failure message without claiming success", async () => {
      downloader.addRepo.mockRejectedValue(new Error("Git clone failed"));
      const ctx = slashCtx({ url: "https://github.com/o/r" }, services);

      await runHandler("add", ctx);

      expect(lastCardJson()).toContain("Git clone failed");
      expect(services.logger.warn).toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("removes the named repo and confirms", async () => {
      const ctx = slashCtx({ name: "addons" }, services);

      await runHandler("remove", ctx);

      expect(downloader.removeRepo).toHaveBeenCalledWith(services, "addons");
      expect(lastCardJson()).toContain("core:repoRemovedTitle");
    });

    it("reports the failure reason when removal throws", async () => {
      downloader.removeRepo.mockRejectedValue(new Error("Repo not found"));
      const ctx = slashCtx({ name: "ghost" }, services);

      await runHandler("remove", ctx);

      expect(lastCardJson()).toContain("Repo not found");
    });
  });

  describe("update", () => {
    it("pulls the named repo and confirms with the sha range", async () => {
      const ctx = slashCtx({ name: "addons" }, services);

      await runHandler("update", ctx);

      expect(downloader.updateRepo).toHaveBeenCalledWith(services, "addons");
      expect(lastCardJson()).toContain("bbbbbbb");
    });

    it("reports the failure reason and warns when the pull throws", async () => {
      downloader.updateRepo.mockRejectedValue(new Error("Network unreachable"));
      const ctx = slashCtx({ name: "addons" }, services);

      await runHandler("update", ctx);

      expect(lastCardJson()).toContain("Network unreachable");
      expect(services.logger.warn).toHaveBeenCalled();
    });
  });

  describe("list", () => {
    it("reports an empty state when no repos are registered", async () => {
      const ctx = slashCtx({}, services);

      await runHandler("list", ctx);

      expect(lastCardJson()).toContain("core:noReposTitle");
      expect(paginateList).not.toHaveBeenCalled();
    });

    it("paginates the repos with their branch and URL", async () => {
      downloader.listRepos.mockResolvedValue([
        { name: "addons", branch: "main", url: "https://github.com/o/addons" },
        { name: "extra", branch: "dev", url: "https://github.com/o/extra" },
      ]);
      const ctx = slashCtx({}, services);

      await runHandler("list", ctx);

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
      const ctx = slashCtx({ repo_name: "addons" }, services);

      await runHandler("modules", ctx);

      expect(lastCardJson()).toContain("core:noModulesFoundTitle");
      expect(paginateList).not.toHaveBeenCalled();
    });

    it("omits hidden modules and badges installed ones", async () => {
      downloader.getModulesInRepo.mockResolvedValue([
        { name: "economy", version: "1.0.0", short: "Economy", hidden: false },
        { name: "internal", version: "0.1.0", short: "Internal", hidden: true },
      ]);
      downloader.getInstalledModules.mockResolvedValue([{ moduleName: "economy" }]);
      const ctx = slashCtx({ repo_name: "addons" }, services);

      await runHandler("modules", ctx);

      const opts = (paginateList as any).mock.calls[0][0];
      expect(opts.items).toHaveLength(1);
      expect(opts.items[0]).toContain("economy");
      expect(opts.items[0]).toContain("core:installedBadge");
    });
  });
});

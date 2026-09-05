import { describe, it, expect, vi, beforeEach } from "vitest";
import { DownloaderUtility, ModuleAlreadyInstalledError } from "#utilities/pieces/DownloaderUtility.js";
import { container } from "@sapphire/framework";
import { resolver } from "#lib/downloader/resolver.js";
import { promises as fs } from "node:fs";

vi.mock("#lib/downloader/resolver.js", () => ({
  resolver: {
    addRepo: vi.fn().mockResolvedValue(undefined),
    installModule: vi.fn().mockResolvedValue({ version: "1.0.0" }),
    getModulesInRepo: vi.fn().mockResolvedValue([{ name: "test-module" }]),
  },
  AddonModulesRoot: "/mock/addon_modules",
  ModuleRoot: "/mock/modules",
}));

vi.mock("node:fs", () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    access: vi.fn(),
    rm: vi.fn().mockResolvedValue(undefined),
    symlink: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
}));

const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn((_file, _args, cb) => {
    cb(null, { stdout: "hash123\n", stderr: "" });
  }),
}));

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
  default: {
    execFile: mockExecFile,
  },
}));

describe("DownloaderUtility", () => {
  let service: DownloaderUtility;
  let mockDb: any;
  let mockModuleStore: any;
  let mockLogger: any;
  let mockClient: any;
  let mockCommandStore: any;
  let mockRedis: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      downloader: {
        readAllInstalledDownloaderModulesWithRepo: vi.fn().mockResolvedValue([]),
        readDownloaderRepo: vi.fn(),
        readInstalledDownloaderModule: vi.fn(),
        writeInstalledDownloaderModule: vi.fn(),
        deleteInstalledDownloaderModule: vi.fn(),
        writeDownloaderRepo: vi.fn(),
        readAllDownloaderRepos: vi.fn(),
        readDownloaderRepoById: vi.fn(),
        updateInstalledDownloaderModuleCommit: vi.fn(),
        readAllInstalledDownloaderModules: vi.fn(),
        readDownloaderRepoWithModules: vi.fn(),
        deleteDownloaderRepo: vi.fn(),
      },
    };

    mockModuleStore = {
      discover: vi.fn().mockResolvedValue(undefined),
      loadModule: vi.fn().mockResolvedValue(undefined),
      unload: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
      setEnabled: vi.fn().mockResolvedValue(undefined),
    };

    mockRedis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue(undefined),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    mockCommandStore = new Map();

    mockClient = {
      application: {
        commands: {
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    };

    (container as any).db = mockDb;
    (container as any).moduleStore = mockModuleStore;
    container.logger = mockLogger;
    container.client = mockClient;
    (container as any).redis = mockRedis;
    container.stores = {
      get: vi.fn().mockReturnValue(mockCommandStore),
    } as any;

    service = new DownloaderUtility(
      { name: "downloader", store: { name: "utilities" } } as any,
      {}
    );
  });

  describe("ModuleAlreadyInstalledError", () => {
    it("creates instance with correct properties", () => {
      const err = new ModuleAlreadyInstalledError("mod-a");
      expect(err.moduleName).toBe("mod-a");
      expect(err.name).toBe("ModuleAlreadyInstalledError");
      expect(err.message).toContain("mod-a");
    });
  });

  describe("onLoad", () => {
    it("invokes syncInstalledModulesOnStartup and logs error on failure", async () => {
      const syncSpy = vi.spyOn(service, "syncInstalledModulesOnStartup").mockRejectedValue(new Error("Sync error"));
      await service.onLoad();
      expect(syncSpy).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        "[DownloaderUtility] Failed to sync installed modules on startup:",
        expect.any(Error)
      );
    });
  });

  describe("syncInstalledModulesOnStartup", () => {
    it("returns early if no installed modules found", async () => {
      mockDb.downloader.readAllInstalledDownloaderModulesWithRepo.mockResolvedValue([]);
      await service.syncInstalledModulesOnStartup();
      expect(fs.mkdir).toHaveBeenCalledWith("/mock/addon_modules", { recursive: true });
      expect(mockModuleStore.discover).not.toHaveBeenCalled();
    });

    it("restores repo if source path does not exist and creates symlink", async () => {
      mockDb.downloader.readAllInstalledDownloaderModulesWithRepo.mockResolvedValue([
        {
          moduleName: "mod1",
          repo: { name: "repo1", url: "https://example.com/repo1.git", branch: "main" },
        },
      ]);

      // fs.access calls: 1st (sourceExists) -> reject, 2nd (targetExists) -> reject, 3rd (sourceExists after restore) -> resolve
      (fs.access as any)
        .mockRejectedValueOnce(new Error("ENOENT"))
        .mockRejectedValueOnce(new Error("ENOENT"))
        .mockResolvedValueOnce(true);

      await service.syncInstalledModulesOnStartup();

      expect(resolver.addRepo).toHaveBeenCalledWith("repo1", "https://example.com/repo1.git", "main");
      expect(fs.symlink).toHaveBeenCalled();
      expect(mockModuleStore.discover).toHaveBeenCalledWith(true);
    });

    it("catches and logs warning if restoration fails", async () => {
      mockDb.downloader.readAllInstalledDownloaderModulesWithRepo.mockResolvedValue([
        {
          moduleName: "mod1",
          repo: { name: "repo1", url: "https://example.com/repo1.git" },
        },
      ]);

      (fs.access as any)
        .mockRejectedValueOnce(new Error("ENOENT"))
        .mockRejectedValueOnce(new Error("ENOENT"))
        .mockResolvedValueOnce(true);

      (fs.symlink as any).mockRejectedValueOnce(new Error("Symlink failed"));

      await service.syncInstalledModulesOnStartup();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "[DownloaderUtility] Failed to restore symlink for mod1:",
        expect.any(Error)
      );
    });
  });

  describe("installModule", () => {
    it("throws error if repo not found", async () => {
      mockDb.downloader.readDownloaderRepo.mockResolvedValue(null);
      await expect(service.installModule("r1", "m1")).rejects.toThrow("Repository **r1** has not been added");
    });

    it("throws ModuleAlreadyInstalledError if module is already installed", async () => {
      mockDb.downloader.readDownloaderRepo.mockResolvedValue({ id: "r1-id" });
      mockDb.downloader.readInstalledDownloaderModule.mockResolvedValue({ id: "m1-id", repoId: "r1-id" });
      await expect(service.installModule("r1", "m1")).rejects.toThrow(ModuleAlreadyInstalledError);
    });

    it("successfully installs module and writes database entry", async () => {
      mockDb.downloader.readDownloaderRepo.mockResolvedValue({ id: "r1-id" });
      mockDb.downloader.readInstalledDownloaderModule.mockResolvedValue(null);

      await service.installModule("r1", "m1");

      expect(resolver.installModule).toHaveBeenCalledWith("r1", "m1");
      expect(mockModuleStore.discover).toHaveBeenCalledWith(true);
      expect(mockModuleStore.loadModule).toHaveBeenCalledWith("m1");
      expect(mockDb.downloader.writeInstalledDownloaderModule).toHaveBeenCalledWith("r1-id", "m1", "1.0.0");
    });

    it("unloads module and unlinks on failure during load/sync", async () => {
      mockDb.downloader.readDownloaderRepo.mockResolvedValue({ id: "r1-id" });
      mockDb.downloader.readInstalledDownloaderModule.mockResolvedValue(null);
      mockModuleStore.loadModule.mockRejectedValue(new Error("Load failed"));

      await expect(service.installModule("r1", "m1")).rejects.toThrow("Load failed");

      expect(mockModuleStore.unload).toHaveBeenCalledWith("m1");
      expect(fs.unlink).toHaveBeenCalledWith("/mock/addon_modules/m1");
    });

    it("passes an explicit revision through to resolver.installModule and persists the resolved commit", async () => {
      mockDb.downloader.readDownloaderRepo.mockResolvedValue({ id: "r1-id" });
      mockDb.downloader.readInstalledDownloaderModule.mockResolvedValue(null);
      (resolver.installModule as any).mockResolvedValueOnce({
        version: "1.0.0",
        commit: "abc1234",
      });

      await service.installModule("r1", "m1", "abc1234");

      expect(resolver.installModule).toHaveBeenCalledWith("r1", "m1", "abc1234");
      expect(mockDb.downloader.updateInstalledDownloaderModuleCommit).toHaveBeenCalledWith(
        "r1-id",
        "m1",
        "abc1234",
      );
    });
  });

  describe("uninstallModule", () => {
    it("throws error if module not installed via downloader", async () => {
      mockDb.downloader.readInstalledDownloaderModule.mockResolvedValue(null);
      await expect(service.uninstallModule("m1")).rejects.toThrow("was not installed via the downloader");
    });

    it("uninstalls module, removes directory, and deletes DB record", async () => {
      mockDb.downloader.readInstalledDownloaderModule.mockResolvedValue({ id: "m1-id", repoId: "r1-id" });

      await service.uninstallModule("m1");

      expect(mockModuleStore.unload).toHaveBeenCalledWith("m1");
      expect(fs.rm).toHaveBeenCalledWith("/mock/addon_modules/m1", { recursive: true, force: true });
      expect(mockDb.downloader.deleteInstalledDownloaderModule).toHaveBeenCalledWith("r1-id", "m1");
    });

    it("ignores 'does not exist' error during unload", async () => {
      mockDb.downloader.readInstalledDownloaderModule.mockResolvedValue({ id: "m1-id", repoId: "r1-id" });
      mockModuleStore.unload.mockRejectedValue(new Error("Module does not exist in store"));

      await service.uninstallModule("m1");

      expect(fs.rm).toHaveBeenCalled();
      expect(mockDb.downloader.deleteInstalledDownloaderModule).toHaveBeenCalledWith("r1-id", "m1");
    });

    it("rethrows non-'does not exist' error during unload", async () => {
      mockDb.downloader.readInstalledDownloaderModule.mockResolvedValue({ id: "m1-id", repoId: "r1-id" });
      mockModuleStore.unload.mockRejectedValue(new Error("Unload crash"));

      await expect(service.uninstallModule("m1")).rejects.toThrow("Unload crash");
    });
  });

  describe("addRepo, updateRepo, listRepos, getModulesInRepo", () => {
    it("addRepo adds repo via resolver and DB", async () => {
      await service.addRepo("r1", "https://url", "main");
      expect(resolver.addRepo).toHaveBeenCalledWith("r1", "https://url", "main");
      expect(mockDb.downloader.writeDownloaderRepo).toHaveBeenCalledWith("r1", "https://url", "main");
    });

    it("updateRepo throws error if repo missing in DB", async () => {
      mockDb.downloader.readDownloaderRepo.mockResolvedValue(null);
      await expect(service.updateRepo("r1")).rejects.toThrow("Repository **r1** not found");
    });

    it("updateRepo updates repo via resolver", async () => {
      mockDb.downloader.readDownloaderRepo.mockResolvedValue({ name: "r1", url: "http://url", branch: "dev" });
      await service.updateRepo("r1");
      expect(resolver.addRepo).toHaveBeenCalledWith("r1", "http://url", "dev");
    });

    it("listRepos delegates to DB", async () => {
      mockDb.downloader.readAllDownloaderRepos.mockResolvedValue(["repo1"]);
      const res = await service.listRepos();
      expect(res).toEqual(["repo1"]);
    });

    it("getModulesInRepo delegates to resolver", async () => {
      const res = await service.getModulesInRepo("r1");
      expect(res).toEqual([{ name: "test-module" }]);
    });
  });

  describe("getRepoStatus", () => {
    it("parses the last commit hash and relative time from git log", async () => {
      mockExecFile.mockImplementation((_file: string, _args: string[], cb: any) => {
        cb(null, { stdout: "abc1234|2 days ago\n", stderr: "" });
      });

      const res = await service.getRepoStatus("repo1");
      expect(res).toEqual({ lastCommit: "abc1234", lastCommitTime: "2 days ago" });
    });

    it("returns nulls when git log fails", async () => {
      mockExecFile.mockImplementation((_file: string, _args: string[], cb: any) => {
        cb(new Error("not a git repository"));
      });

      const res = await service.getRepoStatus("repo1");
      expect(res).toEqual({ lastCommit: null, lastCommitTime: null });
    });
  });

  describe("updateModule", () => {
    it("throws error if module not installed", async () => {
      mockDb.downloader.readInstalledDownloaderModule.mockResolvedValue(null);
      await expect(service.updateModule("m1")).rejects.toThrow("was not installed via the downloader");
    });

    it("throws error if repo not found", async () => {
      mockDb.downloader.readInstalledDownloaderModule.mockResolvedValue({ repoId: "r1-id" });
      mockDb.downloader.readDownloaderRepoById.mockResolvedValue(null);
      await expect(service.updateModule("m1")).rejects.toThrow("Repository for module **m1** could not be found");
    });

    it("returns updated: false if up to date", async () => {
      mockDb.downloader.readInstalledDownloaderModule.mockResolvedValue({ repoId: "r1-id", commit: "hash123" });
      mockDb.downloader.readDownloaderRepoById.mockResolvedValue({ id: "r1-id", name: "repo1", branch: "main" });

      (fs.access as any).mockResolvedValue(true);
      mockExecFile.mockImplementation((_file: string, args: string[], cb: any) => {
        if (args.includes("rev-parse")) {
          cb(null, { stdout: "hash123\n", stderr: "" });
        } else if (args.includes("fetch")) {
          cb(null, { stdout: "", stderr: "" });
        } else {
          cb(null, { stdout: "", stderr: "" });
        }
      });

      const res = await service.updateModule("m1");
      expect(res).toEqual({ updated: false });
    });

    it("updates module on disk and reports that a restart is required", async () => {
      mockDb.downloader.readInstalledDownloaderModule.mockResolvedValue({ repoId: "r1-id", commit: "oldhash" });
      mockDb.downloader.readDownloaderRepoById.mockResolvedValue({ id: "r1-id", name: "repo1", branch: "main" });

      (fs.access as any).mockResolvedValue(true);
      mockExecFile.mockImplementation((_file: string, args: string[], cb: any) => {
        if (args.includes("rev-parse") && args.includes("HEAD")) {
          cb(null, { stdout: "oldhash\n", stderr: "" });
        } else if (args.includes("rev-parse") && args.includes("@{u}")) {
          cb(null, { stdout: "origin/main\n", stderr: "" });
        } else if (args.includes("rev-parse") && args.includes("origin/main")) {
          cb(null, { stdout: "newhash\n", stderr: "" });
        } else if (args.includes("log")) {
          cb(null, { stdout: "feat: new feature\n", stderr: "" });
        } else {
          cb(null, { stdout: "", stderr: "" });
        }
      });

      const res = await service.updateModule("m1");
      expect(res).toEqual({ updated: true, changelog: "feat: new feature", needsRestart: true });
      expect(mockDb.downloader.updateInstalledDownloaderModuleCommit).toHaveBeenCalledWith("r1-id", "m1", "newhash");
    });

    it("throws error when git pull fails", async () => {
      mockDb.downloader.readInstalledDownloaderModule.mockResolvedValue({ repoId: "r1-id", commit: "oldhash" });
      mockDb.downloader.readDownloaderRepoById.mockResolvedValue({ id: "r1-id", name: "repo1", branch: "main" });

      (fs.access as any).mockResolvedValue(true);
      mockExecFile.mockImplementation((_file: string, args: string[], cb: any) => {
        if (args.includes("pull")) {
          const err: any = new Error("Conflict");
          err.stderr = "Git pull conflict";
          cb(err);
        } else {
          cb(null, { stdout: "newhash\n", stderr: "" });
        }
      });

      await expect(service.updateModule("m1")).rejects.toThrow("Git pull failed: Git pull conflict");
    });

    it("serializes concurrent updateModule calls that touch the same repo checkout", async () => {
      mockDb.downloader.readInstalledDownloaderModule.mockResolvedValue({ repoId: "r1-id", commit: "oldhash" });
      mockDb.downloader.readDownloaderRepoById.mockResolvedValue({ id: "r1-id", name: "repo1", branch: "main" });

      (fs.access as any).mockResolvedValue(true);

      let activePulls = 0;
      let maxActivePulls = 0;
      mockExecFile.mockImplementation((_file: string, args: string[], cb: any) => {
        if (args.includes("rev-parse") && args.includes("HEAD")) {
          cb(null, { stdout: "oldhash\n", stderr: "" });
        } else if (args.includes("rev-parse") && args.includes("@{u}")) {
          cb(null, { stdout: "origin/main\n", stderr: "" });
        } else if (args.includes("rev-parse") && args.includes("origin/main")) {
          cb(null, { stdout: "newhash\n", stderr: "" });
        } else if (args.includes("log")) {
          cb(null, { stdout: "feat: change\n", stderr: "" });
        } else if (args.includes("pull")) {
          activePulls++;
          maxActivePulls = Math.max(maxActivePulls, activePulls);
          setTimeout(() => {
            activePulls--;
            cb(null, { stdout: "", stderr: "" });
          }, 20);
        } else {
          cb(null, { stdout: "", stderr: "" });
        }
      });

      const [res1, res2] = await Promise.all([
        service.updateModule("m1"),
        service.updateModule("m2"),
      ]);

      expect(res1).toEqual({ updated: true, changelog: "feat: change", needsRestart: true });
      expect(res2).toEqual({ updated: true, changelog: "feat: change", needsRestart: true });
      expect(maxActivePulls).toBe(1);
    });

    it("returns pinned:false without checking pinned when a pull-less regular update finds nothing new", async () => {
      mockDb.downloader.readInstalledDownloaderModule.mockResolvedValue({
        repoId: "r1-id",
        commit: "hash123",
        pinned: true,
      });

      const res = await service.updateModule("m1");
      expect(res).toEqual({ updated: false, pinned: true });
    });

    it("skips the up-to-date check and pinned short-circuit when an explicit revision is given", async () => {
      mockDb.downloader.readInstalledDownloaderModule.mockResolvedValue({
        repoId: "r1-id",
        commit: "oldhash",
        pinned: true,
      });
      mockDb.downloader.readDownloaderRepoById.mockResolvedValue({
        id: "r1-id",
        name: "repo1",
        branch: "main",
      });
      (resolver.installModule as any).mockResolvedValueOnce({
        version: "1.0.0",
        commit: "pinnedhash",
      });

      const res = await service.updateModule("m1", "pinnedhash");

      expect(res).toEqual({ updated: true, needsRestart: true });
      expect(resolver.installModule).toHaveBeenCalledWith("repo1", "m1", "pinnedhash");
      expect(mockDb.downloader.updateInstalledDownloaderModuleCommit).toHaveBeenCalledWith(
        "r1-id",
        "m1",
        "pinnedhash",
      );
    });
  });

  describe("rollbackModule", () => {
    it("throws error if module not installed via the downloader", async () => {
      mockDb.downloader.readInstalledDownloaderModule.mockResolvedValue(null);
      await expect(service.rollbackModule("m1", "oldhash")).rejects.toThrow(
        "was not installed via the downloader",
      );
    });

    it("throws error if the repository can't be found", async () => {
      mockDb.downloader.readInstalledDownloaderModule.mockResolvedValue({ repoId: "r1-id" });
      mockDb.downloader.readDownloaderRepoById.mockResolvedValue(null);
      await expect(service.rollbackModule("m1", "oldhash")).rejects.toThrow(
        "Repository for module **m1** could not be found",
      );
    });

    it("checks out the given revision against the existing clone and persists the resolved commit", async () => {
      mockDb.downloader.readInstalledDownloaderModule.mockResolvedValue({ repoId: "r1-id" });
      mockDb.downloader.readDownloaderRepoById.mockResolvedValue({ id: "r1-id", name: "repo1" });
      (resolver.installModule as any).mockResolvedValueOnce({
        version: "1.0.0",
        commit: "oldhash",
      });

      const res = await service.rollbackModule("m1", "oldhash");

      expect(resolver.installModule).toHaveBeenCalledWith("repo1", "m1", "oldhash");
      expect(mockModuleStore.discover).toHaveBeenCalledWith(true);
      expect(mockModuleStore.loadModule).toHaveBeenCalledWith("m1");
      expect(mockDb.downloader.updateInstalledDownloaderModuleCommit).toHaveBeenCalledWith(
        "r1-id",
        "m1",
        "oldhash",
      );
      expect(res).toEqual({ commit: "oldhash", needsRestart: true });
    });
  });

  describe("checkForUpdates", () => {
    it("returns the cached result from Redis without hitting the DB or git", async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(["cached-mod"]));

      const res = await service.checkForUpdates();

      expect(res).toEqual(["cached-mod"]);
      expect(mockDb.downloader.readAllInstalledDownloaderModules).not.toHaveBeenCalled();
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it("swallows a per-module failure with a warning and still caches the modules that succeeded", async () => {
      mockRedis.get.mockResolvedValue(null);
      mockDb.downloader.readAllInstalledDownloaderModules.mockResolvedValue([
        { moduleName: "modA" },
        { moduleName: "modB" },
      ]);

      mockDb.downloader.readInstalledDownloaderModule.mockImplementation((name: string) => {
        if (name === "modB") return Promise.reject(new Error("DB down"));
        return Promise.resolve({ repoId: "r1-id-A", commit: "oldhash" });
      });
      mockDb.downloader.readDownloaderRepoById.mockResolvedValue({
        id: "r1-id-A",
        name: "repoA",
        branch: "main",
      });

      (fs.access as any).mockResolvedValue(true);
      mockExecFile.mockImplementation((_file: string, args: string[], cb: any) => {
        if (args.includes("rev-parse") && args.includes("HEAD")) {
          cb(null, { stdout: "oldhash\n", stderr: "" });
        } else if (args.includes("rev-parse") && args.includes("@{u}")) {
          cb(null, { stdout: "origin/main\n", stderr: "" });
        } else if (args.includes("rev-parse") && args.includes("origin/main")) {
          cb(null, { stdout: "newhash\n", stderr: "" });
        } else if (args.includes("log")) {
          cb(null, { stdout: "feat: change\n", stderr: "" });
        } else {
          cb(null, { stdout: "", stderr: "" });
        }
      });

      const res = await service.checkForUpdates();

      expect(res).toEqual(["modA"]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("[DownloaderUtility] Update check failed for modB:")
      );
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "lumi:addon:update-check",
        300,
        JSON.stringify(["modA"])
      );
    });
  });

  describe("toggleModule", () => {
    it("throws error if module was not installed via the downloader", async () => {
      mockDb.downloader.readInstalledDownloaderModule.mockResolvedValue(null);
      await expect(service.toggleModule("m1", true)).rejects.toThrow(
        "was not installed via the downloader"
      );
      expect(mockModuleStore.setEnabled).not.toHaveBeenCalled();
    });

    it("enables/disables the module via the ModuleStore and re-syncs commands", async () => {
      mockDb.downloader.readInstalledDownloaderModule.mockResolvedValue({ id: "m1-id", repoId: "r1-id" });
      const syncSpy = vi.spyOn(service, "syncApplicationCommands").mockResolvedValue(undefined);

      await service.toggleModule("m1", false);

      expect(mockModuleStore.setEnabled).toHaveBeenCalledWith(
        "m1",
        false,
        "toggled via addons panel"
      );
      expect(syncSpy).toHaveBeenCalled();
    });
  });

  describe("getInstalledModules & getInstalledModulesDetailed", () => {
    it("getInstalledModules calls DB", async () => {
      mockDb.downloader.readAllInstalledDownloaderModules.mockResolvedValue(["mod1"]);
      expect(await service.getInstalledModules()).toEqual(["mod1"]);
    });

    it("getInstalledModulesDetailed calls DB", async () => {
      mockDb.downloader.readAllInstalledDownloaderModulesWithRepo.mockResolvedValue([{ moduleName: "mod1" }]);
      expect(await service.getInstalledModulesDetailed()).toEqual([{ moduleName: "mod1" }]);
    });
  });

  describe("removeRepo", () => {
    it("throws error if repo not found", async () => {
      mockDb.downloader.readDownloaderRepoWithModules.mockResolvedValue(null);
      await expect(service.removeRepo("r1")).rejects.toThrow("Repository **r1** not found.");
    });

    it("uninstalls modules and deletes repo", async () => {
      mockDb.downloader.readDownloaderRepoWithModules.mockResolvedValue({
        name: "r1",
        installedModules: [{ moduleName: "m1" }],
      });
      mockDb.downloader.readInstalledDownloaderModule.mockResolvedValue({ id: "m1-id", repoId: "r1-id" });

      await service.removeRepo("r1");

      expect(mockModuleStore.unload).toHaveBeenCalledWith("m1");
      expect(mockDb.downloader.deleteDownloaderRepo).toHaveBeenCalledWith("r1");
    });
  });

  describe("syncApplicationCommands", () => {
    it("skips sync with warning if client.application is missing", async () => {
      container.client = {} as any;
      await service.syncApplicationCommands();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "[DownloaderUtility] client.application not ready; slash command sync skipped"
      );
    });

    it("registers and sets global and guild commands", async () => {
      const mockCmd1 = {
        name: "global-cmd",
        registerApplicationCommands: vi.fn(),
        applicationCommandRegistry: {
          apiCalls: [
            {
              registerOptions: {},
              builtData: { name: "global-cmd", description: "Global" },
            },
          ],
        },
      };

      const mockCmd2 = {
        name: "guild-cmd",
        registerApplicationCommands: vi.fn(),
        applicationCommandRegistry: {
          apiCalls: [
            {
              registerOptions: { guildIds: ["g1", "g2"] },
              builtData: { name: "guild-cmd", description: "Guild" },
            },
          ],
        },
      };

      const commandMap = new Map([
        ["cmd1", mockCmd1],
        ["cmd2", mockCmd2],
      ]);

      (container.stores.get as any).mockReturnValue(commandMap);

      await service.syncApplicationCommands();

      expect(mockClient.application.commands.set).toHaveBeenCalledWith([
        { name: "global-cmd", description: "Global" },
      ]);
      expect(mockClient.application.commands.set).toHaveBeenCalledWith(
        [{ name: "guild-cmd", description: "Guild" }],
        "g1"
      );
      expect(mockClient.application.commands.set).toHaveBeenCalledWith(
        [{ name: "guild-cmd", description: "Guild" }],
        "g2"
      );
    });
  });
});

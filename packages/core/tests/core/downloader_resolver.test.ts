import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

// `resolver.ts` does `const execFileAsync = promisify(execFile)` at module-load
// time, capturing a direct function reference. A `vi.spyOn(child_process,
// "execFile")` installed later (e.g. in a beforeEach) never reaches that
// captured reference, so it silently does nothing. Mocking the whole
// `node:child_process` module - which Vitest hoists above all imports -
// intercepts it at resolution time instead, before resolver.ts ever captures
// a reference.
const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn((...args: any[]) => {
    const cb = args[args.length - 1];
    if (typeof cb === "function") {
      const error: any = new Error("Git clone failed");
      error.stderr = "Git clone failed";
      cb(error, "", "Git clone failed");
    }
    return {} as any;
  }),
}));
vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
  default: { execFile: mockExecFile },
}));

vi.mock("#lib/downloader/validate.js", () => ({
  validateAddon: vi.fn(),
}));
vi.mock("#lib/module-system/manifest.js", () => ({
  detectSubStores: vi.fn(),
  writeManifest: vi.fn(),
}));

import { DownloadResolver, MODULE_ROOT, ADDON_MODULES_ROOT } from "#lib/downloader/resolver.js";
import { validateAddon } from "#lib/downloader/validate.js";
import { detectSubStores, writeManifest } from "#lib/module-system/manifest.js";
// CI trigger comment


describe("DownloadResolver Edge Cases", () => {
  let resolver: DownloadResolver;
  let testDir: string;

  beforeAll(async () => {
    resolver = new DownloadResolver();
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "lumi-downloader-test-"));
  });

  beforeEach(() => {
    mockExecFile.mockClear();
    mockExecFile.mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      if (typeof cb === "function") {
        const error: any = new Error("Git clone failed");
        error.stderr = "Git clone failed";
        cb(error, "", "Git clone failed");
      }
      return {} as any;
    });
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it("handles valid URLs and strips markdown brackets <...>", async () => {
    // Should not throw URL parsing error for bracketed URLs
    await expect(
      resolver.addRepo("test_bracket", "<https://github.com/invalid-org/nonexistent-repo-12345.git>"),
    ).rejects.toThrow("Git clone failed");
  });



  it("cleans up incomplete repository folder on clone failure", async () => {
    const repoName = "test_failed_clone";
    const repoPath = path.join(MODULE_ROOT, repoName);

    // Ensure clean start
    await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});

    await expect(
      resolver.addRepo(repoName, "https://github.com/invalid-org/nonexistent-repo-99999.git"),
    ).rejects.toThrow();

    // Verify corrupt folder was cleaned up automatically
    const exists = await fs
      .access(repoPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it("removes non-git directory if addRepo encounters a corrupt folder without .git", async () => {
    const repoName = "test_corrupt_folder";
    const repoPath = path.join(MODULE_ROOT, repoName);

    // Manually create a non-git directory to simulate previous partial crash
    await fs.mkdir(repoPath, { recursive: true });
    await fs.writeFile(path.join(repoPath, "junk.txt"), "corrupted data");

    await expect(
      resolver.addRepo(repoName, "https://github.com/invalid-org/nonexistent-repo-88888.git"),
    ).rejects.toThrow();

    // Folder should be cleaned up on failure
    const exists = await fs
      .access(repoPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it("addRepo() pulls the latest changes for an already-cloned repo instead of re-cloning", async () => {
    const repoName = "existing_repo";
    const repoPath = path.join(MODULE_ROOT, repoName);
    const gitFolder = path.join(repoPath, ".git");

    vi.spyOn(fs, "access").mockImplementation((p: any) => {
      if (String(p) === repoPath || String(p) === gitFolder) return Promise.resolve(undefined);
      const err: any = new Error("ENOENT");
      err.code = "ENOENT";
      throw err;
    });
    const rmSpy = vi.spyOn(fs, "rm").mockResolvedValue(undefined);

    mockExecFile.mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      if (typeof cb === "function") cb(null, "", "");
      return {} as any;
    });

    await resolver.addRepo(repoName, "https://github.com/some-org/existing-repo.git");

    expect(mockExecFile).toHaveBeenCalledWith(
      "git",
      ["-C", repoPath, "pull"],
      expect.any(Object),
      expect.any(Function),
    );
    // A successful pull never falls back to deleting and re-cloning the repo.
    expect(rmSpy).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it("serializes concurrent addRepo calls for the same repo name so pulls/clones can't interleave", async () => {
    // Regression test for a race where a manual "update repo" click could
    // overlap the 15-minute auto-update sweep (or a double-click) and run
    // two `git pull`/`rm -rf`+`clone` sequences against the same checkout
    // at once, corrupting it. addRepo() now serializes per repo name.
    const repoName = "race_repo";

    // Repo doesn't exist locally yet, so both calls take the "clone" branch.
    vi.spyOn(fs, "access").mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
    vi.spyOn(fs, "rm").mockResolvedValue(undefined);

    let active = 0;
    let maxActive = 0;
    mockExecFile.mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      active++;
      maxActive = Math.max(maxActive, active);
      setTimeout(() => {
        active--;
        cb(null, "", "");
      }, 20);
      return {} as any;
    });

    await Promise.all([
      resolver.addRepo(repoName, "https://github.com/some-org/race-repo.git"),
      resolver.addRepo(repoName, "https://github.com/some-org/race-repo.git"),
    ]);

    // Never more than one git process touching this repo's checkout at once.
    expect(maxActive).toBe(1);
    expect(mockExecFile).toHaveBeenCalledTimes(2);

    vi.restoreAllMocks();
  });

  it("does not serialize addRepo calls for different repo names", async () => {
    const repoNameA = "race_repo_a";
    const repoNameB = "race_repo_b";

    vi.spyOn(fs, "access").mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
    vi.spyOn(fs, "rm").mockResolvedValue(undefined);

    let active = 0;
    let maxActive = 0;
    mockExecFile.mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      active++;
      maxActive = Math.max(maxActive, active);
      setTimeout(() => {
        active--;
        cb(null, "", "");
      }, 20);
      return {} as any;
    });

    await Promise.all([
      resolver.addRepo(repoNameA, "https://github.com/some-org/race-repo-a.git"),
      resolver.addRepo(repoNameB, "https://github.com/some-org/race-repo-b.git"),
    ]);

    // Different repos must not block behind the same per-name lock.
    expect(maxActive).toBe(2);

    vi.restoreAllMocks();
  });

  describe("installModule()", () => {
    const repoName = "repo_x";
    const moduleName = "economy";
    const sourcePath = path.join(MODULE_ROOT, repoName, moduleName);
    const targetPath = path.join(ADDON_MODULES_ROOT, moduleName);
    const infoPath = path.join(sourcePath, "info.json");
    const manifestPath = path.join(sourcePath, "manifest.json");

    afterEach(() => {
      // Restores the real fs implementations spied on in each test, and clears
      // call history on the vi.mock()-based validateAddon/detectSubStores/
      // writeManifest mocks so assertions don't see calls from a prior test.
      vi.restoreAllMocks();
      vi.clearAllMocks();
    });

    /** Wires fs.access so only the given paths "exist" on disk. */
    function mockExistingPaths(existing: Set<string>) {
      vi.spyOn(fs, "access").mockImplementation((p: any) => {
        if (existing.has(String(p))) return Promise.resolve(undefined);
        const err: any = new Error("ENOENT");
        err.code = "ENOENT";
        throw err;
      });
    }

    it("throws when the source module directory does not exist in the repo", async () => {
      mockExistingPaths(new Set());

      await expect(resolver.installModule(repoName, moduleName)).rejects.toThrow(
        `Module ${moduleName} not found in repo ${repoName}`,
      );
    });

    it("throws when the module has no info.json", async () => {
      mockExistingPaths(new Set([sourcePath]));

      await expect(resolver.installModule(repoName, moduleName)).rejects.toThrow(
        `Module ${moduleName} has no info.json - cannot install`,
      );
    });

    it("auto-generates manifest.json when it is missing, from info.json contents", async () => {
      const info = {
        name: moduleName,
        short: "Economy",
        emoji: "\u{1F4B0}",
        description: "Economy module",
        version: "2.0.0",
        dependencies: ["core"],
        conflicts: [],
      };

      // manifest.json deliberately absent; everything else present.
      mockExistingPaths(new Set([sourcePath, infoPath]));
      vi.spyOn(fs, "readFile").mockImplementation((p: any) => {
        if (String(p) === infoPath) return Promise.resolve(JSON.stringify(info));
        throw new Error(`unexpected readFile: ${p}`);
      });
      vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
      vi.spyOn(fs, "symlink").mockResolvedValue(undefined);
      (validateAddon as any).mockResolvedValue({ errors: [] });
      (detectSubStores as any).mockResolvedValue(["commands"]);
      (writeManifest as any).mockResolvedValue(undefined);

      const result = await resolver.installModule(repoName, moduleName);

      expect(writeManifest).toHaveBeenCalledWith(
        sourcePath,
        expect.objectContaining({
          name: moduleName,
          displayName: "Economy",
          emoji: "\u{1F4B0}",
          description: "Economy module",
          version: "2.0.0",
          disableable: true,
          dependencies: ["core"],
          conflicts: [],
          targetService: "worker",
          subStores: ["commands"],
        }),
      );
      expect(result).toEqual(info);
    });

    it("symlinks the source module into the addon modules root on a successful install", async () => {
      const info = { name: moduleName, version: "1.0.0" };

      // manifest.json already exists this time - auto-generation must be skipped.
      mockExistingPaths(new Set([sourcePath, infoPath, manifestPath]));
      vi.spyOn(fs, "readFile").mockImplementation((p: any) => {
        if (String(p) === infoPath) return Promise.resolve(JSON.stringify(info));
        throw new Error(`unexpected readFile: ${p}`);
      });
      vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
      const symlinkSpy = vi.spyOn(fs, "symlink").mockResolvedValue(undefined);
      (validateAddon as any).mockResolvedValue({ errors: [] });

      const result = await resolver.installModule(repoName, moduleName);

      expect(writeManifest).not.toHaveBeenCalled();
      expect(symlinkSpy).toHaveBeenCalledWith(sourcePath, targetPath, "dir");
      expect(result).toEqual(info);
    });

    it("throws with the validation errors when the addon fails validation", async () => {
      const info = { name: moduleName, version: "1.0.0" };
      mockExistingPaths(new Set([sourcePath, infoPath, manifestPath]));
      vi.spyOn(fs, "readFile").mockImplementation((p: any) => {
        if (String(p) === infoPath) return Promise.resolve(JSON.stringify(info));
        throw new Error(`unexpected readFile: ${p}`);
      });
      (validateAddon as any).mockResolvedValue({ errors: ["index.ts is missing"] });

      await expect(resolver.installModule(repoName, moduleName)).rejects.toThrow(
        /failed validation/,
      );
    });
  });
});

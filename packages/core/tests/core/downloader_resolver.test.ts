import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DownloadResolver, MODULE_ROOT, ADDON_MODULES_ROOT } from "#lib/downloader/resolver.js";

describe("DownloadResolver Edge Cases", () => {
  let resolver: DownloadResolver;
  let testDir: string;

  beforeAll(async () => {
    resolver = new DownloadResolver();
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "lumi-downloader-test-"));
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it("handles valid URLs and strips markdown brackets <...>", async () => {
    // Should not throw URL parsing error for bracketed URLs
    await expect(
      resolver.addRepo("test_bracket", "<http://127.0.0.1:1/invalid-repo-12345.git>"),
    ).rejects.toThrow("Git clone failed");
  });

  it("cleans up incomplete repository folder on clone failure", async () => {
    const repoName = "test_failed_clone";
    const repoPath = path.join(MODULE_ROOT, repoName);

    // Ensure clean start
    await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});

    await expect(
      resolver.addRepo(repoName, "http://127.0.0.1:1/invalid-repo-99999.git"),
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
      resolver.addRepo(repoName, "http://127.0.0.1:1/invalid-repo-88888.git"),
    ).rejects.toThrow();

    // Folder should be cleaned up on failure
    const exists = await fs
      .access(repoPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });
});

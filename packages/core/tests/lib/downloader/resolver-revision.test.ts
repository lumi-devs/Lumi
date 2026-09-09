import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { execFileSync } from "node:child_process";
import { container } from "@sapphire/framework";
import {
  DownloadResolver,
  ModuleRoot,
  AddonModulesRoot,
} from "#lib/downloader/resolver.js";
import { fakeSpawnResult } from "../../helpers/mock-bun-spawn.js";

// Re-installed in beforeEach below, not module scope: the file's own
// afterEach(vi.restoreAllMocks()) reverts spies after every test.
let spawnSpy: ReturnType<typeof vi.spyOn<typeof Bun, "spawn">>;

// These suites shell out to real git, which reaches `execFileAsync`. Hiding
// the `Bun` global routes it through the `node:child_process` fallback.
let savedBun: unknown;
function hideBunGlobal(): void {
  savedBun = (globalThis as { Bun?: unknown }).Bun;
  (globalThis as { Bun?: unknown }).Bun = undefined;
}
function restoreBunGlobal(): void {
  (globalThis as { Bun?: unknown }).Bun = savedBun as typeof Bun;
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

async function writeModuleInfo(moduleDir: string, version: string) {
  await fs.mkdir(moduleDir, { recursive: true });
  await fs.writeFile(
    path.join(moduleDir, "info.json"),
    JSON.stringify({
      name: path.basename(moduleDir),
      author: ["LumiTeam"],
      description: "Revision test module",
      short: "Revision Test",
      version,
      min_bot_version: "0.1.0",
      end_user_data_statement: "Revision test privacy statement",
    }),
  );
  await fs.writeFile(
    path.join(moduleDir, "manifest.json"),
    JSON.stringify({
      name: path.basename(moduleDir),
      displayName: path.basename(moduleDir),
      emoji: "🧪",
      description: "Revision test module",
      version,
      targetUtility: "worker",
      subStores: [],
      configFields: [],
    }),
  );
  await fs.writeFile(
    path.join(moduleDir, "index.ts"),
    `@DefineModule({ name: "${path.basename(moduleDir)}" })\nexport class TestModule {}\n`,
  );
}

describe("DownloadResolver - revision resolution & checkout", () => {
  let tmpDir: string;
  let resolver: DownloadResolver;

  beforeEach(async () => {
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;
    resolver = new DownloadResolver();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lumi-resolver-revision-"));
    spawnSpy = vi.spyOn(Bun, "spawn");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("resolveRevision / checkoutRevision against a real repo", () => {
    let repoPath: string;
    let firstCommit: string;
    let secondCommit: string;

    beforeEach(async () => {
      hideBunGlobal();
      repoPath = path.join(tmpDir, "repo");
      await fs.mkdir(repoPath, { recursive: true });
      await git(repoPath, "init", "-q");
      await git(repoPath, "config", "user.email", "test@example.com");
      await git(repoPath, "config", "user.name", "Test");

      await fs.writeFile(path.join(repoPath, "a.txt"), "one");
      await git(repoPath, "add", "-A");
      await git(repoPath, "commit", "-q", "-m", "first");
      firstCommit = await git(repoPath, "rev-parse", "HEAD");

      await fs.writeFile(path.join(repoPath, "a.txt"), "two");
      await git(repoPath, "add", "-A");
      await git(repoPath, "commit", "-q", "-m", "second");
      secondCommit = await git(repoPath, "rev-parse", "HEAD");
    });

    it("resolves a full SHA to itself", async () => {
      const resolved = await resolver.resolveRevision(repoPath, firstCommit);
      expect(resolved).toBe(firstCommit);
    });

    it("resolves an unambiguous short SHA to the full commit hash", async () => {
      const resolved = await resolver.resolveRevision(
        repoPath,
        firstCommit.slice(0, 10),
      );
      expect(resolved).toBe(firstCommit);
    });

    it("checkoutRevision detaches HEAD at the resolved commit without re-cloning", async () => {
      spawnSpy.mockClear();

      const resolved = await resolver.checkoutRevision(repoPath, firstCommit);
      expect(resolved).toBe(firstCommit);

      const head = await git(repoPath, "rev-parse", "HEAD");
      expect(head).toBe(firstCommit);

      const cloneCalls = spawnSpy.mock.calls.filter(
        ([cmd]) => Array.isArray(cmd) && cmd.includes("clone"),
      );
      expect(cloneCalls).toHaveLength(0);
    });

    it("throws with the full candidate list when a short SHA is ambiguous", async () => {
      restoreBunGlobal();
      spawnSpy.mockImplementationOnce(
        () => fakeSpawnResult(`${firstCommit}\n${secondCommit}\n`) as any,
      );

      await expect(resolver.resolveRevision(repoPath, "deadbee")).rejects.toThrow(
        /ambiguous/,
      );
    });

    afterEach(() => {
      restoreBunGlobal();
    });
  });

  describe("installModule with a revision (real ModuleRoot fixture)", () => {
    const repoName = `test-repo-revision-${Date.now()}`;
    const moduleName = "test-module";
    let repoPath: string;
    let moduleDir: string;
    let firstCommit: string;

    beforeEach(async () => {
      hideBunGlobal();
      repoPath = path.join(ModuleRoot, repoName);
      moduleDir = path.join(repoPath, moduleName);
      await fs.mkdir(repoPath, { recursive: true });
      await git(repoPath, "init", "-q");
      await git(repoPath, "config", "user.email", "test@example.com");
      await git(repoPath, "config", "user.name", "Test");

      await writeModuleInfo(moduleDir, "1.0.0");
      await git(repoPath, "add", "-A");
      await git(repoPath, "commit", "-q", "-m", "v1");
      firstCommit = await git(repoPath, "rev-parse", "HEAD");

      await writeModuleInfo(moduleDir, "2.0.0");
      await git(repoPath, "add", "-A");
      await git(repoPath, "commit", "-q", "-m", "v2");
    });

    afterEach(async () => {
      restoreBunGlobal();
      await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});
      await fs
        .rm(path.join(AddonModulesRoot, moduleName), { recursive: true, force: true })
        .catch(() => {});
    });

    it("checks out the given commit and returns info with the resolved commit", async () => {
      const info = await resolver.installModule(repoName, moduleName, firstCommit);

      expect(info.commit).toBe(firstCommit);
      expect(info.version).toBe("1.0.0");

      const head = await git(repoPath, "rev-parse", "HEAD");
      expect(head).toBe(firstCommit);
    });
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const { mockExecFile } = vi.hoisted(() => ({ mockExecFile: vi.fn() }));

// `resolver.ts` does `promisify(execFile)` on the named import it captured at
// module load - since this mock replaces that import, the mock also needs
// its own `promisify.custom` implementation (Node's real `execFile` has one
// that resolves `{ stdout, stderr }`; a plain `vi.fn()` doesn't, so a naive
// `promisify()` of it would resolve with just the raw first callback arg).
// The custom impl below still funnels through `mockExecFile` itself so
// `mockImplementationOnce` overrides in individual tests keep working.
vi.mock("node:child_process", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("node:child_process")>();
  const { promisify } = await import("node:util");

  mockExecFile.mockImplementation((...args: unknown[]) =>
    (actual.execFile as any)(...args),
  );
  (mockExecFile as any)[promisify.custom] = (...callArgs: unknown[]) =>
    new Promise((resolve, reject) => {
      mockExecFile(...callArgs, (err: unknown, stdout: string, stderr: string) => {
        if (err) {
          if (stderr !== undefined) (err as any).stderr = stderr;
          reject(err);
        } else {
          resolve({ stdout, stderr });
        }
      });
    });

  return {
    ...actual,
    execFile: mockExecFile,
    default: { ...(actual as any).default, execFile: mockExecFile },
  };
});

import { execFileSync } from "node:child_process";
import { container } from "@sapphire/framework";
import {
  DownloadResolver,
  MODULE_ROOT,
  ADDON_MODULES_ROOT,
} from "#lib/downloader/resolver.js";

// Uses execFileSync (untouched by the node:child_process mock below, which
// only wraps `execFile`) so test-fixture git setup never goes through the
// same interception path being exercised by the resolver itself.
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
      min_bot_version: "1.0.0",
      end_user_data_statement: "Revision test privacy statement",
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
      mockExecFile.mockClear();

      const resolved = await resolver.checkoutRevision(repoPath, firstCommit);
      expect(resolved).toBe(firstCommit);

      const head = await git(repoPath, "rev-parse", "HEAD");
      expect(head).toBe(firstCommit);

      const cloneCalls = mockExecFile.mock.calls.filter(
        ([, cmdArgs]) => Array.isArray(cmdArgs) && cmdArgs.includes("clone"),
      );
      expect(cloneCalls).toHaveLength(0);
    });

    it("throws with the full candidate list when a short SHA is ambiguous", async () => {
      mockExecFile.mockImplementationOnce((...args: any[]) => {
        const cb = args[args.length - 1];
        cb(null, `${firstCommit}\n${secondCommit}\n`, "");
        return {} as any;
      });

      await expect(resolver.resolveRevision(repoPath, "deadbee")).rejects.toThrow(
        /ambiguous/,
      );
    });
  });

  describe("installModule with a revision (real MODULE_ROOT fixture)", () => {
    const repoName = `test-repo-revision-${Date.now()}`;
    const moduleName = "test-module";
    let repoPath: string;
    let moduleDir: string;
    let firstCommit: string;

    beforeEach(async () => {
      repoPath = path.join(MODULE_ROOT, repoName);
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
      await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});
      await fs
        .rm(path.join(ADDON_MODULES_ROOT, moduleName), { recursive: true, force: true })
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

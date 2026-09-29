import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "bun:test";
import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { container } from "@sapphire/framework";
import {
  DownloadResolver,
  ModuleRoot,
  AddonModulesRoot,
  AddonSignatureRejectedError,
} from "#lib/downloader/resolver.js";

function hasSshKeygen(): boolean {
  try {
    execFileSync("ssh-keygen", ["-h"], { stdio: "ignore" });
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

async function makeSshKey(dir: string, name: string): Promise<{ privateKey: string; publicKey: string }> {
  const privateKey = path.join(dir, name);
  execFileSync("ssh-keygen", ["-t", "ed25519", "-N", "", "-f", privateKey], { stdio: "ignore" });
  const publicKey = (await fs.readFile(`${privateKey}.pub`, "utf8")).trim();
  return { privateKey, publicKey };
}

async function writeModuleInfo(moduleDir: string, version: string) {
  await fs.mkdir(moduleDir, { recursive: true });
  const name = path.basename(moduleDir);
  await fs.writeFile(
    path.join(moduleDir, "info.json"),
    JSON.stringify({
      name,
      author: ["LumiTeam"],
      description: "Signature test module",
      short: "Signature test",
      version,
      end_user_data_statement: "Signature test privacy statement",
    }),
  );
  await fs.writeFile(
    path.join(moduleDir, "manifest.json"),
    JSON.stringify({
      name,
      displayName: name,
      emoji: "🔏",
      description: "Signature test module",
      version,
      targetUtility: "worker",
      subStores: [],
      configFields: [],
    }),
  );
  await fs.writeFile(
    path.join(moduleDir, "index.ts"),
    `@DefineModule({ name: "${name}" })\nexport class TestModule {}\n`,
  );
}

describe.skipIf(!hasSshKeygen())("DownloadResolver - ADDON_SIGNATURE_POLICY enforcement", () => {
  let tmpDir: string;
  let allowedSignersFile: string;
  let trustedKey: { privateKey: string; publicKey: string };
  let untrustedKey: { privateKey: string; publicKey: string };
  let resolver: DownloadResolver;
  const originalEnv = {
    policy: process.env["ADDON_SIGNATURE_POLICY"],
    file: process.env["ADDON_ALLOWED_SIGNERS_FILE"],
  };

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lumi-resolver-signature-"));
    trustedKey = await makeSshKey(tmpDir, "trusted");
    untrustedKey = await makeSshKey(tmpDir, "untrusted");
    allowedSignersFile = path.join(tmpDir, "allowed_signers");
    await fs.writeFile(
      allowedSignersFile,
      `trusted-signer namespaces="git" ${trustedKey.publicKey}\n`,
    );
  }, 45000);

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    if (originalEnv.policy === undefined) delete process.env["ADDON_SIGNATURE_POLICY"];
    else process.env["ADDON_SIGNATURE_POLICY"] = originalEnv.policy;
    if (originalEnv.file === undefined) delete process.env["ADDON_ALLOWED_SIGNERS_FILE"];
    else process.env["ADDON_ALLOWED_SIGNERS_FILE"] = originalEnv.file;
  });

  beforeEach(() => {
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;
    resolver = new DownloadResolver();
    process.env["ADDON_ALLOWED_SIGNERS_FILE"] = allowedSignersFile;
  });

  afterEach(() => {
    delete process.env["ADDON_SIGNATURE_POLICY"];
    delete process.env["ADDON_ALLOWED_SIGNERS_FILE"];
  });

  describe("installModule with a revision (pinned SHA checked before the pin worktree is created)", () => {
    const repoName = `sig-test-repo-${Date.now()}`;
    const moduleName = "sig-module";
    let repoPath: string;
    let moduleDir: string;
    let validCommit: string;
    let unsignedCommit: string;
    let untrustedCommit: string;

    beforeAll(async () => {
      repoPath = path.join(ModuleRoot, repoName);
      moduleDir = path.join(repoPath, moduleName);
      await fs.mkdir(repoPath, { recursive: true });
      git(repoPath, "init", "-q");
      git(repoPath, "config", "user.email", "test@example.com");
      git(repoPath, "config", "user.name", "Test");
      git(repoPath, "config", "gpg.format", "ssh");

      await writeModuleInfo(moduleDir, "1.0.0");
      git(repoPath, "add", "-A");
      git(repoPath, "config", "user.signingkey", trustedKey.privateKey);
      git(repoPath, "commit", "-q", "-S", "-m", "trusted");
      validCommit = git(repoPath, "rev-parse", "HEAD");

      try {
        git(repoPath, "config", "--unset", "user.signingkey");
      } catch {
        // ignore
      }
      git(repoPath, "commit", "-q", "-m", "unsigned", "--allow-empty");
      unsignedCommit = git(repoPath, "rev-parse", "HEAD");

      git(repoPath, "config", "user.signingkey", untrustedKey.privateKey);
      git(repoPath, "commit", "-q", "-S", "-m", "untrusted", "--allow-empty");
      untrustedCommit = git(repoPath, "rev-parse", "HEAD");
    }, 45000);

    afterAll(async () => {
      await fs
        .rm(path.join(AddonModulesRoot, moduleName), { recursive: true, force: true })
        .catch(() => {});
      try {
        execFileSync("git", ["-C", repoPath, "worktree", "prune"]);
      } catch {
        // ignore
      }
      await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});
      await fs
        .rm(path.join(ModuleRoot, ".lumi-pins", repoName), { recursive: true, force: true })
        .catch(() => {});
    }, 45000);

    afterEach(async () => {
      await fs
        .rm(path.join(AddonModulesRoot, moduleName), { recursive: true, force: true })
        .catch(() => {});
    });

    it("policy off: installs a signed commit without recording a signer", async () => {
      process.env["ADDON_SIGNATURE_POLICY"] = "off";
      const info = await resolver.installModule(repoName, moduleName, validCommit);
      expect(info.signedBy).toBeNull();
      expect(info.signatureWarning).toBeNull();
    }, 45000);

    it("policy require: accepts a validly signed, trusted commit and records the signer", async () => {
      process.env["ADDON_SIGNATURE_POLICY"] = "require";
      const info = await resolver.installModule(repoName, moduleName, validCommit);
      expect(info.signedBy).toBe("trusted-signer");
      expect(info.signatureWarning).toBeNull();
    }, 45000);

    it("policy require: rejects an unsigned commit before the pin worktree exists", async () => {
      process.env["ADDON_SIGNATURE_POLICY"] = "require";
      await expect(
        resolver.installModule(repoName, moduleName, unsignedCommit),
      ).rejects.toThrow(AddonSignatureRejectedError);

      await expect(
        fs.access(path.join(ModuleRoot, ".lumi-pins", repoName, unsignedCommit)),
      ).rejects.toThrow();
    }, 45000);

    it("policy require: rejects a commit signed by an untrusted key", async () => {
      process.env["ADDON_SIGNATURE_POLICY"] = "require";
      await expect(
        resolver.installModule(repoName, moduleName, untrustedCommit),
      ).rejects.toThrow(AddonSignatureRejectedError);
    }, 45000);

    it("policy warn: installs an unsigned commit but logs and surfaces a warning", async () => {
      process.env["ADDON_SIGNATURE_POLICY"] = "warn";
      const info = await resolver.installModule(repoName, moduleName, unsignedCommit);
      expect(info.signedBy).toBeNull();
      expect(info.signatureWarning).toMatch(/not signed/);
      expect(container.logger.warn).toHaveBeenCalled();
    }, 45000);
  });

  describe("updateRepo (target SHA checked before reset --hard)", () => {
    const repoName = `sig-test-update-${Date.now()}`;
    let upstreamPath: string;
    let repoPath: string;

    beforeEach(async () => {
      upstreamPath = path.join(tmpDir, `${repoName}-upstream`);
      repoPath = path.join(ModuleRoot, repoName);

      await fs.mkdir(upstreamPath, { recursive: true });
      git(upstreamPath, "init", "-q");
      git(upstreamPath, "config", "user.email", "test@example.com");
      git(upstreamPath, "config", "user.name", "Test");
      git(upstreamPath, "config", "gpg.format", "ssh");
      git(upstreamPath, "config", "user.signingkey", trustedKey.privateKey);
      git(upstreamPath, "commit", "-q", "-S", "-m", "initial", "--allow-empty");

      execFileSync("git", ["clone", "-q", upstreamPath, repoPath]);
      git(repoPath, "config", "user.email", "test@example.com");
      git(repoPath, "config", "user.name", "Test");
    }, 45000);

    afterEach(async () => {
      await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});
      await fs.rm(upstreamPath, { recursive: true, force: true }).catch(() => {});
    });

    it("policy require: fast-forwards to a trusted signed commit and records the signer", async () => {
      git(upstreamPath, "config", "user.signingkey", trustedKey.privateKey);
      git(upstreamPath, "commit", "-q", "-S", "-m", "next", "--allow-empty");

      process.env["ADDON_SIGNATURE_POLICY"] = "require";
      const result = await resolver.updateRepo(repoName, "https://example.invalid/repo.git", "default");

      expect(result.changed).toBe(true);
      expect(result.signedBy).toBe("trusted-signer");

      const head = git(repoPath, "rev-parse", "HEAD");
      expect(head).toBe(result.newSha);
    }, 45000);

    it("policy require: refuses to fast-forward to an unsigned commit, leaving HEAD untouched", async () => {
      const oldHead = git(repoPath, "rev-parse", "HEAD");
      try {
        git(upstreamPath, "config", "--unset", "user.signingkey");
      } catch {
        // ignore
      }
      git(upstreamPath, "commit", "-q", "-m", "unsigned next", "--allow-empty");

      process.env["ADDON_SIGNATURE_POLICY"] = "require";
      await expect(
        resolver.updateRepo(repoName, "https://example.invalid/repo.git", "default"),
      ).rejects.toThrow(AddonSignatureRejectedError);

      const head = git(repoPath, "rev-parse", "HEAD");
      expect(head).toBe(oldHead);
    }, 45000);
  });
});

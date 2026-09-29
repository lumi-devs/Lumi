import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { verifyCommitSignature } from "./signature.js";

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

describe.skipIf(!hasSshKeygen())("verifyCommitSignature", () => {
  let tmpDir: string;
  let repoPath: string;
  let allowedSignersFile: string;
  let trustedKey: { privateKey: string; publicKey: string };
  let untrustedKey: { privateKey: string; publicKey: string };

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lumi-signature-test-"));
    repoPath = path.join(tmpDir, "repo");
    await fs.mkdir(repoPath, { recursive: true });
    git(repoPath, "init", "-q");
    git(repoPath, "config", "user.email", "signer@example.com");
    git(repoPath, "config", "user.name", "Signer");
    git(repoPath, "config", "gpg.format", "ssh");

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
  });

  it("reports a valid, trusted commit with its signer principal", async () => {
    git(repoPath, "config", "user.signingkey", trustedKey.privateKey);
    await fs.writeFile(path.join(repoPath, "a.txt"), "one");
    git(repoPath, "add", "-A");
    git(repoPath, "commit", "-q", "-S", "-m", "signed by trusted key");
    const sha = git(repoPath, "rev-parse", "HEAD");

    const result = await verifyCommitSignature(repoPath, sha, allowedSignersFile);
    expect(result).toEqual({ status: "valid", signer: "trusted-signer" });
  }, 45000);

  it("reports an unsigned commit as unsigned", async () => {
    git(repoPath, "config", "--unset", "user.signingkey");
    await fs.writeFile(path.join(repoPath, "b.txt"), "two");
    git(repoPath, "add", "-A");
    git(repoPath, "commit", "-q", "-m", "not signed");
    const sha = git(repoPath, "rev-parse", "HEAD");

    const result = await verifyCommitSignature(repoPath, sha, allowedSignersFile);
    expect(result).toEqual({ status: "unsigned" });
  }, 45000);

  it("reports a commit signed by a key absent from allowed_signers as untrusted", async () => {
    git(repoPath, "config", "user.signingkey", untrustedKey.privateKey);
    await fs.writeFile(path.join(repoPath, "c.txt"), "three");
    git(repoPath, "add", "-A");
    git(repoPath, "commit", "-q", "-S", "-m", "signed by untrusted key");
    const sha = git(repoPath, "rev-parse", "HEAD");

    const result = await verifyCommitSignature(repoPath, sha, allowedSignersFile);
    expect(result.status).toBe("untrusted");
  }, 45000);
});

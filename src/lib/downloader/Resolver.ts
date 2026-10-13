import { container } from "#src/lib/Services.js";
import { Time } from "#src/shared/Index.ts";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ModuleInfo, RepoInfo } from "#src/lib/downloader/Types.js";
import { validateAddon } from "#src/lib/downloader/Validate.js";
import { z } from "zod";
import { logError } from "#src/lib/utilities/Errors.js";
import { withSerializedWork } from "#src/lib/utilities/SerializedWork.js";
import { execFileAsync } from "#src/lib/utilities/ExecFile.js";
import { getAddonAllowedSignersFile, getAddonSignaturePolicy, getRepoRoot } from "#src/lib/Env.js";
import { verifyCommitSignature, type SignatureVerification } from "#src/lib/downloader/Signature.js";

const execGit = (args: string[]) =>
  execFileAsync("git", args, {
    timeout: 30000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });

const execError =
  (context: string) =>
    (err: NodeJS.ErrnoException & { stderr?: string }): never => {
      const msg = (err.stderr || err.message || String(err)).trim();
      throw new Error(`${context}${msg ? `: ${msg}` : ""}`);
    };

export class RepoAlreadyInstalledError extends Error {
  public readonly repoName: string;
  public readonly sha: string | null;
  public constructor(repoName: string, sha: string | null) {
    super(`Repository ${repoName} is already installed${sha ? ` at ${sha}` : ""}.`);
    this.name = "RepoAlreadyInstalledError";
    this.repoName = repoName;
    this.sha = sha;
  }
}

export interface RepoUpdateResult {
  oldSha: string | null;
  newSha: string;
  changed: boolean;
  diffStat: string;
  recloned: boolean;
  signedBy: string | null;
  signatureWarning: string | null;
}

export interface AddRepoResult {
  sha: string | null;
  signedBy: string | null;
  signatureWarning: string | null;
  repoInfo: RepoInfo | null;
}

export class AddonSignatureRejectedError extends Error {
  public readonly sha: string;
  public readonly verification: Exclude<SignatureVerification, { status: "valid" }>;

  public constructor(sha: string, verification: Exclude<SignatureVerification, { status: "valid" }>) {
    super(`Commit \`${sha.slice(0, 7)}\` was rejected: ${describeVerification(verification)}.`);
    this.name = "AddonSignatureRejectedError";
    this.sha = sha;
    this.verification = verification;
  }
}

function describeVerification(
  verification: Exclude<SignatureVerification, { status: "valid" }>,
): string {
  switch (verification.status) {
    case "unsigned":
      return "the commit is not signed";
    case "untrusted":
      return `the signer is not in the trusted allowed-signers list (${verification.detail})`;
    case "invalid":
      return `signature verification failed (${verification.detail})`;
  }
}

const repoSchema = z.string().regex(/^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/);
const branchSchema = z.string().regex(/^[a-zA-Z0-9_.][a-zA-Z0-9_.-]*$/);

function buildGitCloneArgs(
  branch: string,
  url: string,
  path: string,
): string[] {
  const args = ["clone"];
  if (branch !== "default") args.push("-b", branch);
  args.push("--", url, path);
  return args;
}

function parseUrl(val: string): string {
  val = val.trim().replace(/^<|>$/g, "");
  if (val.startsWith("http://") || val.startsWith("https://")) {
    try {
      new URL(val);
      return val;
    } catch {
      throw new Error("Invalid HTTP/HTTPS URL");
    }
  }
  const sshRegex = /^git@[a-zA-Z0-9.-]+:[a-zA-Z0-9._\/-]+(?:\.git)?$/i;
  const sshUrlRegex =
    /^ssh:\/\/git@[a-zA-Z0-9.-]+(?::[0-9]+)?\/[a-zA-Z0-9._\/-]+(?:\.git)?$/i;
  if (sshRegex.test(val) || sshUrlRegex.test(val)) return val;
  throw new Error(
    "Must be a valid HTTP/HTTPS URL or Git SSH URL (git@github.com:owner/repo.git) - local/file paths are not allowed",
  );
}

const reqsSchema = z.array(
  z.string().regex(/^[a-zA-Z0-9_.@\/][a-zA-Z0-9_.@\/\-^~>=<*]*$/),
);

export const RepoRoot = getRepoRoot();
export const DataRoot = path.join(RepoRoot, "data");

export const ModuleRoot = path.join(
  DataRoot,
  "3rd-party-modules",
);

export const AddonModulesRoot = path.join(
  DataRoot,
  "installed-modules",
);

export const PinRoot = path.join(ModuleRoot, ".lumi-pins");

export class DownloadResolver {

  private async _checkSignaturePolicy(
    repoPath: string,
    sha: string,
  ): Promise<{ signedBy: string | null; signatureWarning: string | null }> {
    const policy = getAddonSignaturePolicy();
    if (policy === "off") return { signedBy: null, signatureWarning: null };

    const allowedSignersFile = getAddonAllowedSignersFile();
    if (!allowedSignersFile) {
      return { signedBy: null, signatureWarning: null };
    }

    const verification = await verifyCommitSignature(repoPath, sha, allowedSignersFile);
    if (verification.status === "valid") {
      return { signedBy: verification.signer, signatureWarning: null };
    }

    if (policy === "require") {
      throw new AddonSignatureRejectedError(sha, verification);
    }

    const warning = describeVerification(verification);
    container.logger?.warn?.(
      `[Downloader] Signature warning for ${sha.slice(0, 7)}: ${warning}`,
    );
    return { signedBy: null, signatureWarning: warning };
  }

  public async addRepo(
    name: string,
    url: string,
    branch = "default",
  ): Promise<AddRepoResult> {
    name = repoSchema.parse(name);
    url = parseUrl(url);
    branch = branchSchema.parse(branch);

    return withSerializedWork(name, async () => {
      const repoPath = path.join(ModuleRoot, name);
      const gitFolder = path.join(repoPath, ".git");

      if (await this._exists(repoPath)) {
        if (!(await this._exists(gitFolder))) {
          container.logger?.warn?.(
            `[Downloader] ${name} exists at ${repoPath} but is not a valid git repository. Cleaning up...`,
          );
          await fs.rm(repoPath, { recursive: true, force: true }).catch(() => { });
        }
      }

      const isExisting =
        (await this._exists(repoPath)) && (await this._exists(gitFolder));

      if (isExisting) {
        const inDb = await container.db?.downloader?.readDownloaderRepo(name);
        if (inDb) {
          const sha = await this._getHeadSha(repoPath);
          throw new RepoAlreadyInstalledError(name, sha);
        }
        container.logger?.info?.(
          `[Downloader] ${name} exists on disk but is not registered in DB. Re-registering...`,
        );
        const sha = await this._getHeadSha(repoPath);
        const repoInfo = await this._readRepoInfo(repoPath);
        return { sha, signedBy: null, signatureWarning: null, repoInfo };
      }

      container.logger?.info?.(`[Downloader] Cloning repo: ${url}`);
      await fs.mkdir(ModuleRoot, { recursive: true });
      const cloneArgs = buildGitCloneArgs(branch, url, repoPath);
      await execGit(cloneArgs).catch(async () => {
        await fs.rm(repoPath, { recursive: true, force: true }).catch(() => { });
        throw new Error("Git clone failed");
      });

      const sha = await this._getHeadSha(repoPath);

      if (sha) {
        try {
          const { signedBy, signatureWarning } = await this._checkSignaturePolicy(repoPath, sha);
          return { sha, signedBy, signatureWarning, repoInfo: await this._readRepoInfo(repoPath) };
        } catch (err) {
          await fs.rm(repoPath, { recursive: true, force: true }).catch(() => { });
          throw err;
        }
      }

      return { sha, signedBy: null, signatureWarning: null, repoInfo: await this._readRepoInfo(repoPath) };
    });
  }

  public async updateRepo(
    name: string,
    url: string,
    branch = "default",
  ): Promise<RepoUpdateResult> {
    name = repoSchema.parse(name);
    url = parseUrl(url);
    branch = branchSchema.parse(branch);

    return withSerializedWork(name, async () => {
      const repoPath = path.join(ModuleRoot, name);
      const gitFolder = path.join(repoPath, ".git");

      const isExisting =
        (await this._exists(repoPath)) && (await this._exists(gitFolder));
      if (!isExisting) {
        container.logger?.info?.(
          `[Downloader] Repository ${name} tracked in DB but missing from disk. Auto-restoring clone...`,
        );
        const added = await this.addRepo(name, url, branch);
        return {
          oldSha: null,
          newSha: added.sha ?? "",
          changed: true,
          diffStat: "Restored fresh clone from remote.",
          recloned: true,
          signedBy: added.signedBy,
          signatureWarning: added.signatureWarning,
        };
      }

      const oldSha = await this._getHeadSha(repoPath);

      container.logger?.info?.(`[Downloader] Fetching updates for repo: ${name}`);
      const fetchArgs =
        branch === "default"
          ? ["-C", repoPath, "fetch", "origin"]
          : ["-C", repoPath, "fetch", "origin", branch];

      let recloned = false;
      await execGit(fetchArgs).catch(async () => {
        container.logger?.warn?.(
          `[Downloader] Git fetch failed for ${name}, attempting clean clone fallback...`,
        );
        recloned = true;
        const tmpClone = `${repoPath}.reclone-${crypto.randomUUID()}`;
        const cloneArgs = buildGitCloneArgs(branch, url, tmpClone);
        await execGit(cloneArgs).catch(async (cloneErr) => {
          await fs.rm(tmpClone, { recursive: true, force: true }).catch(() => { });
          execError("Git clone failed")(cloneErr);
        });
        await fs.rm(repoPath, { recursive: true, force: true }).catch(() => { });
        await fs.rename(tmpClone, repoPath).catch(async (renameErr) => {
          await fs.rm(tmpClone, { recursive: true, force: true }).catch(() => { });
          throw renameErr;
        });
      });

      if (recloned) {

        const newSha = await this._getHeadSha(repoPath);
        if (!newSha) {
          throw new Error(
            `Repository **${name}** has no resolvable HEAD after re-cloning - the checkout may be corrupt.`,
          );
        }
        try {
          await this._revalidateInstalledModules(name, repoPath, repoPath);
          const { signedBy, signatureWarning } = await this._checkSignaturePolicy(repoPath, newSha);
          return {
            oldSha,
            newSha,
            changed: oldSha !== newSha,
            diffStat: "",
            recloned,
            signedBy,
            signatureWarning,
          };
        } catch (validationErr) {
          if (validationErr instanceof AddonSignatureRejectedError) {
            throw new Error(
              `${validationErr.message}\n\nThe previous commit could not be restored because the repo had to be freshly re-cloned. Run \`,repo remove ${name}\` and review it manually before adding it again.`,
            );
          }
          throw new Error(
            `${(validationErr as Error).message}\n\nThe previous commit could not be restored because the repo had to be freshly re-cloned. Run \`,repo remove ${name}\` and review it manually before adding it again.`,
          );
        }
      }

      const targetRef = await this._resolveFetchTarget(repoPath, branch);
      const newSha = await execGit(["-C", repoPath, "rev-parse", targetRef])
        .then(({ stdout }) => stdout.trim())
        .catch(execError(`Could not resolve fetched revision for ${name}`));

      const changed = oldSha !== newSha;
      if (!changed) {
        return {
          oldSha,
          newSha,
          changed: false,
          diffStat: "",
          recloned: false,
          signedBy: null,
          signatureWarning: null,
        };
      }

      const diffStat = await this._buildDiffStat(repoPath, oldSha, newSha);

      const tmpDir = path.join(
        os.tmpdir(),
        `lumi-repo-update-${name}-${crypto.randomUUID()}`,
      );
      let signedBy: string | null = null;
      let signatureWarning: string | null = null;
      try {
        await execGit(["-C", repoPath, "worktree", "add", "--detach", tmpDir, newSha]).catch(
          execError(`Failed to stage ${name}'s fetched revision for validation`),
        );

        await this._revalidateInstalledModules(name, repoPath, tmpDir);
        ({ signedBy, signatureWarning } = await this._checkSignaturePolicy(tmpDir, newSha));

        await execGit(["-C", repoPath, "reset", "--hard", newSha]).catch(
          execError(`Failed to fast-forward ${name} to the validated revision`),
        );
      } finally {
        await execGit(["-C", repoPath, "worktree", "remove", "--force", tmpDir]).catch(
          () => fs.rm(tmpDir, { recursive: true, force: true }).catch(() => { }),
        );
        await execGit(["-C", repoPath, "worktree", "prune"]).catch(() => { });
      }

      return { oldSha, newSha, changed: true, diffStat, recloned: false, signedBy, signatureWarning };
    });
  }

  private async _buildDiffStat(repoPath: string, oldSha: string | null, newSha: string): Promise<string> {
    if (!oldSha) return "";
    const raw = await execGit(["-C", repoPath, "diff", "--stat", `${oldSha}..${newSha}`])
      .then(({ stdout }) => stdout.trim())
      .catch(() => "");
    if (!raw) return "";
    const files = raw.split("\n").filter(Boolean);
    if (files.length <= 5) return files.join("\n");
    const names = files.slice(0, -1).map((line) => line.split("|")[0]!.trim());
    return `**${files.length - 1} files changed**\n${names.slice(0, 5).join(", ")}${names.length > 5 ? `, +${names.length - 5} more` : ""}`;
  }

  private async _resolveFetchTarget(
    repoPath: string,
    branch: string,
  ): Promise<string> {
    if (branch === "default") {
      const { stdout } = await execGit([
        "-C",
        repoPath,
        "rev-parse",
        "--abbrev-ref",
        "@{u}",
      ]).catch(() => ({ stdout: "" }));
      const upstream = stdout.trim();
      if (upstream && !upstream.includes("@{u}")) return upstream;
    }
    return "FETCH_HEAD";
  }

  public async getModulesInRepo(repoName: string): Promise<ModuleInfo[]> {
    repoName = repoSchema.parse(repoName);
    const repoPath = path.join(ModuleRoot, repoName);

    if (!(await this._exists(repoPath))) {
      const dbRepo = await container.db?.downloader?.readDownloaderRepo(repoName);
      if (dbRepo) {
        container.logger?.info?.(
          `[Downloader] Repository ${repoName} tracked in DB but missing from disk. Auto-restoring clone...`,
        );
        await this.addRepo(dbRepo.name, dbRepo.url, dbRepo.branch || "default");
      } else {
        throw new Error(
          `Repository **${repoName}** has not been cloned locally. Run \`,repo add\` first.`,
        );
      }
    }

    const indexPath = path.join(repoPath, "modules.json");
    if (await this._exists(indexPath)) {
      try {
        const index = (await Bun.file(indexPath).json().catch(() => null)) as {
          modules?: ModuleInfo[];
        } | null;
        if (index && Array.isArray(index.modules)) return index.modules;
      } catch (err: unknown) {
        container.logger?.warn?.(
          `[Downloader] Failed to parse modules.json in ${repoName}, falling back to scan:`,
          err,
        );
      }
    }

    const entries = await fs.readdir(repoPath, { withFileTypes: true });
    const modules: ModuleInfo[] = [];
    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        entry.name.startsWith(".") ||
        entry.name.startsWith("_")
      )
        continue;

      const manifestPath = path.join(repoPath, entry.name, "manifest.json");
      if (await this._exists(manifestPath)) {
        try {
          const info = (await Bun.file(manifestPath).json().catch(() => null)) as ModuleInfo | null;
          if (info) modules.push(info);
        } catch (err: unknown) {
          container.logger?.warn?.(
            `[Downloader] Failed to parse manifest.json for ${entry.name}:`,
            err,
          );
        }
      }
    }
    return modules;
  }

  public async resolveRevision(
    repoPath: string,
    revision: string,
  ): Promise<string> {
    const isHexPrefix = /^[0-9a-fA-F]{4,40}$/.test(revision);

    if (isHexPrefix) {
      const { stdout } = await execGit([
        "-C",
        repoPath,
        "rev-parse",
        `--disambiguate=${revision}`,
      ]).catch(() => ({ stdout: "" }));
      const candidates = stdout
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      if (candidates.length > 1) {
        throw new Error(
          `Revision **${revision}** is ambiguous and matches ${candidates.length} commits:\n${candidates.map((c) => `• \`${c}\``).join("\n")}\nUse a longer SHA to disambiguate.`,
        );
      }
      if (candidates.length === 1) {
        const [full] = candidates;
        await execGit(["-C", repoPath, "cat-file", "-e", `${full}^{commit}`]).catch(
          () => {
            throw new Error(
              `Revision **${revision}** resolves to \`${full}\`, which is not a commit.`,
            );
          },
        );
        return full!;
      }
    }

    const { stdout } = await execGit([
      "-C",
      repoPath,
      "rev-parse",
      "--verify",
      `${revision}^{commit}`,
    ]).catch(
      execError(`Revision **${revision}** could not be resolved to a commit`),
    );
    return stdout.trim();
  }

  public async checkoutRevision(
    repoPath: string,
    revision: string,
  ): Promise<string> {
    const resolved = await this.resolveRevision(repoPath, revision);
    await execGit(["-C", repoPath, "checkout", "--detach", resolved]).catch(
      execError(`Git checkout of ${revision} failed`),
    );
    return resolved;
  }

  public async installModule(
    repoName: string,
    moduleName: string,
    revision?: string,
  ): Promise<
    ModuleInfo & { commit: string | null; signedBy: string | null; signatureWarning: string | null }
  > {
    repoName = repoSchema.parse(repoName);
    moduleName = repoSchema.parse(moduleName);

    const repoPath = path.join(ModuleRoot, repoName);
    const targetPath = path.join(AddonModulesRoot, moduleName);

    let commit: string | null = null;
    let sourceRoot = repoPath;
    let signedBy: string | null = null;
    let signatureWarning: string | null = null;
    if (revision) {
      commit = await this.resolveRevision(repoPath, revision);
      ({ signedBy, signatureWarning } = await this._checkSignaturePolicy(repoPath, commit));
      sourceRoot = await this._ensurePinWorktree(repoPath, repoName, commit);
    }

    const sourcePath = path.join(sourceRoot, moduleName);

    if (!(await this._exists(sourcePath))) {
      throw new Error(`Module ${moduleName} not found in repo ${repoName}`);
    }

    const manifestPath = path.join(sourcePath, "manifest.json");
    if (!(await this._exists(manifestPath))) {
      throw new Error(
        `Module ${moduleName} has no manifest.json - generate one with \`lumi addon validate\` or \`bun run modules:manifest\`.`,
      );
    }
    const info = (await Bun.file(manifestPath).json()) as ModuleInfo;

    const { errors } = await validateAddon(sourcePath);
    if (errors.length) {
      throw new Error(
        `Module **${moduleName}** failed validation:\n${errors.map((e) => `• ${e}`).join("\n")}`,
      );
    }

    await fs.mkdir(AddonModulesRoot, { recursive: true });

    if (info.requirements?.length) {
      container.logger?.info?.(
        `[Downloader] Installing isolated requirements for ${moduleName}: ${info.requirements.join(", ")}`,
      );
      const reqs = reqsSchema.parse(info.requirements);

      const localPackageJsonPath = path.join(sourcePath, "package.json");
      if (!(await this._exists(localPackageJsonPath))) {
        const localPackageJson = {
          name: `lumi-module-${moduleName}`,
          version: "1.0.0",
          private: true,
        };
        await Bun.write(
          localPackageJsonPath,
          JSON.stringify(localPackageJson, null, 2),
        );
      }

      await execFileAsync(
        "bun",
        ["add", "--ignore-scripts", ...reqs],
        { cwd: sourcePath, timeout: Time.Minute },
      ).catch(execError("Requirement installation failed"));
    }

    const existingTarget = await fs.readlink(targetPath).catch(() => null);
    const previousSourcePath =
      existingTarget !== null
        ? path.resolve(path.dirname(targetPath), existingTarget)
        : null;

    if (previousSourcePath !== null && !this._belongsToRepo(previousSourcePath, repoPath, repoName)) {
      throw new Error(
        `A module named "${moduleName}" is already installed from a different repository (${existingTarget}). Uninstall it before installing this one.`,
      );
    }

    await fs.rm(targetPath, { recursive: true, force: true }).catch(() => { });
    await fs.symlink(sourcePath, targetPath, "dir");

    const pinSha = commit ?? (await this._getHeadSha(repoPath));
    if (pinSha) {
      const tree = await execGit(["-C", repoPath, "rev-parse", `${pinSha}^{tree}`])
        .then(({ stdout }) => stdout.trim())
        .catch(() => null);
      container.logger?.info?.(
        `[Downloader] Pin ${repoName}@${pinSha}${tree ? ` tree ${tree}` : ""} -> ${moduleName}`,
      );
    }

    if (previousSourcePath !== null && previousSourcePath !== path.resolve(sourcePath)) {
      await this._releasePinIfUnused(repoPath, previousSourcePath).catch((err: unknown) => {
        container.logger?.warn?.(
          `[Downloader] Failed to release stale pinned worktree for ${moduleName}: ${(err as Error).message}`,
        );
      });
    }

    container.logger?.info?.(
      `[Downloader] Installed ${moduleName} from ${repoName}${commit ? ` @ ${commit}` : ""}`,
    );

    return { ...info, commit, signedBy, signatureWarning };
  }

  private _belongsToRepo(sourcePath: string, repoPath: string, repoName: string): boolean {
    if (sourcePath === repoPath || sourcePath.startsWith(repoPath + path.sep)) return true;
    const relative = path.relative(PinRoot, sourcePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
    return relative.split(path.sep)[0] === repoName;
  }

  private async _ensurePinWorktree(
    repoPath: string,
    repoName: string,
    sha: string,
  ): Promise<string> {
    const pinPath = path.join(PinRoot, repoName, sha);

    if (await this._exists(path.join(pinPath, ".git"))) {
      return pinPath;
    }

    await fs.rm(pinPath, { recursive: true, force: true }).catch(() => { });
    await fs.mkdir(path.dirname(pinPath), { recursive: true });
    await execGit(["-C", repoPath, "worktree", "add", "--detach", pinPath, sha]).catch(
      execError(`Failed to create a pinned checkout of ${repoName}@${sha}`),
    );

    return pinPath;
  }

  private async _releasePinIfUnused(repoPath: string, sourcePath: string): Promise<void> {
    const relative = path.relative(PinRoot, sourcePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) return;
    const [repoName, sha] = relative.split(path.sep);
    if (!repoName || !sha) return;

    const pinPath = path.join(PinRoot, repoName, sha);
    if (!(await this._exists(pinPath))) return;

    const stillUsed = await this._isPinStillUsed(pinPath);
    if (stillUsed) return;

    await execGit(["-C", repoPath, "worktree", "remove", "--force", pinPath]).catch(() =>
      fs.rm(pinPath, { recursive: true, force: true }).catch(() => { }),
    );
    await execGit(["-C", repoPath, "worktree", "prune"]).catch(() => { });

    const pinRepoDir = path.dirname(pinPath);
    const remaining = await fs.readdir(pinRepoDir).catch(() => null);
    if (remaining && remaining.length === 0) {
      await fs.rmdir(pinRepoDir).catch(() => { });
    }
  }

  private async _isPinStillUsed(pinPath: string): Promise<boolean> {
    const entries = await fs.readdir(AddonModulesRoot, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const linkPath = path.join(AddonModulesRoot, entry.name);
      const real = await fs.realpath(linkPath).catch(() => null);
      if (real && (real === pinPath || real.startsWith(pinPath + path.sep))) return true;
    }
    return false;
  }

  public async releasePinnedWorktreeIfUnused(previousSourcePath: string | null): Promise<void> {
    if (previousSourcePath === null) return;
    const relative = path.relative(PinRoot, previousSourcePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) return;
    const repoName = relative.split(path.sep)[0];
    if (!repoName) return;
    const repoPath = path.join(ModuleRoot, repoName);
    await this._releasePinIfUnused(repoPath, previousSourcePath);
  }

  private async _revalidateInstalledModules(
    repoName: string,
    repoPath: string,
    validateRoot: string,
  ): Promise<void> {
    if (!(await this._exists(AddonModulesRoot))) return;

    const entries = await fs.readdir(AddonModulesRoot, {
      withFileTypes: true,
    });
    const failures: string[] = [];

    for (const entry of entries) {
      const linkPath = path.join(AddonModulesRoot, entry.name);
      let real: string;
      try {
        real = await fs.realpath(linkPath);
      } catch {
        continue;
      }
      if (real !== repoPath && !real.startsWith(repoPath + path.sep)) continue;

      const relative = path.relative(repoPath, real);
      const targetPath = relative ? path.join(validateRoot, relative) : validateRoot;

      const { errors } = await validateAddon(targetPath);
      if (errors.length) {
        failures.push(
          `**${entry.name}**:\n${errors.map((e) => `• ${e}`).join("\n")}`,
        );
      }
    }

    if (failures.length) {
      throw new Error(
        `Repo **${repoName}** update pulled in changes that fail addon validation for already-installed module(s):\n${failures.join("\n\n")}`,
      );
    }
  }

  private async _getHeadSha(repoPath: string): Promise<string | null> {
    return execGit(["-C", repoPath, "rev-parse", "HEAD"])
      .then(({ stdout }) => stdout.trim())
      .catch(() => null);
  }

  private async _readRepoInfo(repoPath: string): Promise<RepoInfo | null> {
    const manifestPath = path.join(repoPath, "manifest.json");
    if (!(await this._exists(manifestPath))) return null;
    try {
      const raw = (await Bun.file(manifestPath).json().catch(() => null)) as Record<string, unknown> | null;
      if (!raw) return null;
      const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
      const strs = (v: unknown): string[] | undefined =>
        Array.isArray(v) ? v.filter((e): e is string => typeof e === "string") : undefined;
      return { author: strs(raw.author) ?? [], description: str(raw.description) ?? "", short: str(raw.short), install_msg: str(raw.install_msg) };
    } catch {
      return null;
    }
  }

  public async deleteRepoDisk(repoName: string): Promise<void> {
    repoName = repoSchema.parse(repoName);
    const repoPath = path.join(ModuleRoot, repoName);
    const pinRepoPath = path.join(PinRoot, repoName);
    await fs.rm(pinRepoPath, { recursive: true, force: true }).catch(() => {});
    await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});
  }

  private async _exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        err.code !== "ENOENT"
      ) {
        logError("DownloaderResolver._exists", err);
      }
      return false;
    }
  }
}

export const resolver = new DownloadResolver();

import { container } from "@sapphire/framework";
import { Time } from "@sapphire/time-utilities";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import type { ModuleInfo } from "./types.js";
import { validateAddon } from "./validate.js";
import { s } from "@sapphire/shapeshift";
import { logError } from "#lib/utilities/errors.js";
import {
  detectSubStores,
  writeManifest,
  type ModuleManifest,
} from "#lib/module-system/manifest.js";
import { withSerializedWork } from "#lib/utilities/misc.js";
import { execFileAsync } from "#lib/utilities/exec-file.js";

const execGit = (args: string[]) =>
  execFileAsync("git", args, {
    timeout: 30000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });

/** Rejection handler that rethrows a git/bun execFile failure as a clean Error with stderr. */
const execError =
  (context: string) =>
    (err: NodeJS.ErrnoException & { stderr?: string }): never => {
      const msg = (err.stderr || err.message || String(err)).trim();
      throw new Error(`${context}${msg ? `: ${msg}` : ""}`);
    };

/**
 * Thrown by {@linkcode DownloadResolver.addRepo} when the target repo is
 * already cloned on disk. Callers must go through
 * {@linkcode DownloadResolver.updateRepo} to pull - "add" never mutates an
 * existing checkout.
 */
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
}


const repoSchema = s.string().regex(/^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/);
const branchSchema = s.string().regex(/^[a-zA-Z0-9_.][a-zA-Z0-9_.-]*$/);

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

const reqsSchema = s.array(
  s.string().regex(/^[a-zA-Z0-9_.@/][a-zA-Z0-9_.@/-]*$/),
);

export const ModuleRoot = path.join(
  process.cwd(),
  "data",
  "3rd-party-modules",
);
/** Where symlinks for installed addons live - registered as a second ModuleStore root. */
export const AddonModulesRoot = path.join(
  process.cwd(),
  "data",
  "installed-modules",
);

export class DownloadResolver {
  /**
   * Clones `name` if it isn't on disk yet. Never pulls an existing checkout -
   * a repo that's already cloned must go through {@linkcode updateRepo}, so
   * that pulling in new upstream commits is always an explicit, reviewable
   * step rather than a side effect of re-running the "add" flow.
   */
  public async addRepo(
    name: string,
    url: string,
    branch = "default",
  ): Promise<string | null> {
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
        const sha = await this._getHeadSha(repoPath);
        throw new RepoAlreadyInstalledError(name, sha);
      }

      container.logger?.info?.(`[Downloader] Cloning repo: ${url}`);
      await fs.mkdir(ModuleRoot, { recursive: true });
      const cloneArgs = buildGitCloneArgs(branch, url, repoPath);
      await execGit(cloneArgs).catch(async () => {
        await fs.rm(repoPath, { recursive: true, force: true }).catch(() => { });
        throw new Error("Git clone failed");
      });

      return this._getHeadSha(repoPath);
    });
  }

  /**
   * Fetches the latest commit for an already-cloned repo, validates it in an
   * isolated worktree BEFORE touching the live checkout, and only then fast
   * -forwards. Unlike the old `addRepo`-does-both behavior (and unlike a
   * plain "pull then validate"), the unvalidated revision is never on disk
   * where a sandbox child respawn, a live reload, or dev-mode HMR could pick
   * it up: if validation fails, the live checkout's HEAD was never moved.
   */
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
        throw new Error(
          `Repository **${name}** is not cloned locally. Use \`,repo add\` first.`,
        );
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
        await fs.rm(repoPath, { recursive: true, force: true }).catch(() => { });
        const cloneArgs = buildGitCloneArgs(branch, url, repoPath);
        await execGit(cloneArgs).catch(async (cloneErr) => {
          await fs.rm(repoPath, { recursive: true, force: true }).catch(() => { });
          execError("Git clone failed")(cloneErr);
        });
      });

      if (recloned) {
        // The clone fallback already replaced the live tree wholesale - there's
        // no pre-fetch checkout left to validate-before-switching, so this is
        // the one case that still validates in place, same as before.
        const newSha = await this._getHeadSha(repoPath);
        if (!newSha) {
          throw new Error(
            `Repository **${name}** has no resolvable HEAD after re-cloning - the checkout may be corrupt.`,
          );
        }
        try {
          await this._revalidateInstalledModules(name, repoPath, repoPath);
        } catch (validationErr) {
          throw new Error(
            `${(validationErr as Error).message}\n\nThe previous commit could not be restored because the repo had to be freshly re-cloned. Run \`,repo remove ${name}\` and review it manually before adding it again.`,
          );
        }
        return { oldSha, newSha, changed: oldSha !== newSha, diffStat: "", recloned };
      }

      const targetRef = await this._resolveFetchTarget(repoPath, branch);
      const newSha = await execGit(["-C", repoPath, "rev-parse", targetRef])
        .then(({ stdout }) => stdout.trim())
        .catch(execError(`Could not resolve fetched revision for ${name}`));

      const changed = oldSha !== newSha;
      if (!changed) {
        return { oldSha, newSha, changed: false, diffStat: "", recloned: false };
      }

      const diffStat = oldSha
        ? await execGit(["-C", repoPath, "diff", "--stat", `${oldSha}..${newSha}`])
            .then(({ stdout }) => stdout.trim())
            .catch(() => "")
        : "";

      // Materialize the fetched revision into a throwaway worktree so the
      // validator can run against it without ever checking it out live.
      const tmpDir = path.join(
        os.tmpdir(),
        `lumi-repo-update-${name}-${randomUUID()}`,
      );
      try {
        await execGit(["-C", repoPath, "worktree", "add", "--detach", tmpDir, newSha]).catch(
          execError(`Failed to stage ${name}'s fetched revision for validation`),
        );

        await this._revalidateInstalledModules(name, repoPath, tmpDir);

        // Validation passed - now, and only now, move the live checkout.
        await execGit(["-C", repoPath, "reset", "--hard", newSha]).catch(
          execError(`Failed to fast-forward ${name} to the validated revision`),
        );
      } finally {
        await execGit(["-C", repoPath, "worktree", "remove", "--force", tmpDir]).catch(
          () => fs.rm(tmpDir, { recursive: true, force: true }).catch(() => { }),
        );
        await execGit(["-C", repoPath, "worktree", "prune"]).catch(() => { });
      }

      return { oldSha, newSha, changed: true, diffStat, recloned: false };
    });
  }

  /** Resolves the ref that a just-completed `git fetch` landed on, without a checkout. */
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
      throw new Error(
        `Repository **${repoName}** has not been cloned locally. Run \`,repo add\` first.`,
      );
    }

    const indexPath = path.join(repoPath, "modules.json");
    if (await this._exists(indexPath)) {
      try {
        const index = JSON.parse(await fs.readFile(indexPath, "utf8")) as {
          modules?: ModuleInfo[];
        };
        if (Array.isArray(index.modules)) return index.modules;
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

      const infoPath = path.join(repoPath, entry.name, "info.json");
      if (await this._exists(infoPath)) {
        try {
          const info = JSON.parse(
            await fs.readFile(infoPath, "utf8"),
          ) as ModuleInfo;
          modules.push(info);
        } catch (err: unknown) {
          container.logger?.warn?.(
            `[Downloader] Failed to parse info.json for ${entry.name}:`,
            err,
          );
        }
      }
    }
    return modules;
  }

  /**
   * Resolves a user-supplied revision (full/short SHA, branch, or tag) to a
   * full commit hash within `repoPath`, rejecting short SHAs that match more
   * than one commit instead of silently picking one.
   */
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

  /**
   * Checks out `revision` (resolved via {@linkcode resolveRevision}) in an
   * already-cloned repo, detaching HEAD. Shared by install-with-revision and
   * rollback, since both just need the repo's working tree pointed at a
   * specific commit.
   */
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
  ): Promise<ModuleInfo & { commit: string | null }> {
    repoName = repoSchema.parse(repoName);
    moduleName = repoSchema.parse(moduleName);

    const repoPath = path.join(ModuleRoot, repoName);
    const sourcePath = path.join(ModuleRoot, repoName, moduleName);
    const targetPath = path.join(AddonModulesRoot, moduleName);

    if (!(await this._exists(sourcePath))) {
      throw new Error(`Module ${moduleName} not found in repo ${repoName}`);
    }

    let commit: string | null = null;
    if (revision) {
      commit = await this.checkoutRevision(repoPath, revision);
    }

    const infoPath = path.join(sourcePath, "info.json");
    if (!(await this._exists(infoPath))) {
      throw new Error(`Module ${moduleName} has no info.json - cannot install`);
    }
    const info = JSON.parse(await fs.readFile(infoPath, "utf8")) as ModuleInfo;

    const { errors } = await validateAddon(sourcePath);
    if (errors.length) {
      throw new Error(
        `Module **${moduleName}** failed validation:\n${errors.map((e) => `• ${e}`).join("\n")}`,
      );
    }

    const manifestPath = path.join(sourcePath, "manifest.json");
    if (!(await this._exists(manifestPath))) {
      const manifest: ModuleManifest = {
        name: info.name || moduleName,
        displayName: info.short || info.name || moduleName,
        emoji: info.emoji || "📦",
        description: info.description || "",
        short: info.short,
        endUserDataStatement: info.end_user_data_statement,
        version: info.version || "1.0.0",
        disableable: true,
        dependencies: info.dependencies || [],
        conflicts: info.conflicts || [],
        configOverrides: false,
        targetUtility: "worker",
        subStores: await detectSubStores(sourcePath),
        configFields: [],
      };
      await writeManifest(sourcePath, manifest);
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
        await fs.writeFile(
          localPackageJsonPath,
          JSON.stringify(localPackageJson, null, 2),
        );
      }

      await execFileAsync(
        "bun",
        ["add", "--ignore-scripts", ...reqs],
        { cwd: sourcePath, timeout: Time.Minute },
      ).catch(execError("Requirement installation failed"));

      const nodeModulesLumiPath = path.join(sourcePath, "node_modules", "lumi");
      if (!(await this._exists(nodeModulesLumiPath))) {
        await fs.mkdir(path.join(sourcePath, "node_modules"), {
          recursive: true,
        });
        await fs
          .symlink(process.cwd(), nodeModulesLumiPath, "dir")
          .catch(() => { });
      }
    }

    // Two repos can each ship a module of the same name. Overwriting silently
    // would leave the DB claiming both are installed while only one is linked.
    const existingTarget = await fs.readlink(targetPath).catch(() => null);
    if (
      existingTarget !== null &&
      path.resolve(path.dirname(targetPath), existingTarget) !== path.resolve(sourcePath)
    ) {
      throw new Error(
        `A module named "${moduleName}" is already installed from a different repository (${existingTarget}). Uninstall it before installing this one.`,
      );
    }

    await fs.rm(targetPath, { recursive: true, force: true }).catch(() => { });
    await fs.symlink(sourcePath, targetPath, "dir");

    container.logger?.info?.(
      `[Downloader] Installed ${moduleName} from ${repoName}${commit ? ` @ ${commit}` : ""}`,
    );

    return { ...info, commit };
  }

  /**
   * Re-validates every module symlinked from `repoPath`, but reads the actual
   * files from `validateRoot` instead - so callers can point this at a
   * throwaway worktree holding the fetched-but-not-yet-live revision, rather
   * than duplicating the validator's own module-discovery logic.
   */
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
        continue; // broken symlink - nothing on disk to (re)validate
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

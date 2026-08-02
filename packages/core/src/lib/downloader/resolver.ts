import { container } from "@sapphire/framework";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ModuleInfo } from "./types.js";
import { validateAddon } from "./validate.js";
import { s } from "@sapphire/shapeshift";
import { logError } from "#lib/utilities/errors.js";
import {
  detectSubStores,
  writeManifest,
  type ModuleManifest,
} from "#lib/module-system/manifest.js";

const execFileAsync = promisify(execFile);
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


const repoSchema = s.string().regex(/^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/);
const branchSchema = s.string().regex(/^[a-zA-Z0-9_.][a-zA-Z0-9_.-]*$/);
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
  if (val.startsWith("file://")) {
    return val;
  }
  const sshRegex = /^git@[a-zA-Z0-9.-]+:[a-zA-Z0-9._\/-]+(?:\.git)?$/i;
  const sshUrlRegex =
    /^ssh:\/\/git@[a-zA-Z0-9.-]+(?::[0-9]+)?\/[a-zA-Z0-9._\/-]+(?:\.git)?$/i;
  if (sshRegex.test(val) || sshUrlRegex.test(val)) return val;
  throw new Error(
    "Must be a valid HTTP/HTTPS URL, file URL, or Git SSH URL (git@github.com:owner/repo.git)",
  );
}

const reqsSchema = s.array(
  s.string().regex(/^[a-zA-Z0-9_.@/][a-zA-Z0-9_.@/-]*$/),
);

export const MODULE_ROOT = path.join(
  process.cwd(),
  "data",
  "3rd-party-modules",
);
/** Where symlinks for installed addons live - registered as a second ModuleStore root. */
export const ADDON_MODULES_ROOT = path.join(
  process.cwd(),
  "data",
  "installed-modules",
);

/**
 * Handles the logic of cloning repositories, verifying info.json,
 * and resolving dependencies.
 */
export class DownloadResolver {
  public async addRepo(
    name: string,
    url: string,
    branch = "default",
  ): Promise<void> {
    name = repoSchema.parse(name);
    url = parseUrl(url);
    branch = branchSchema.parse(branch);

    const repoPath = path.join(MODULE_ROOT, name);
    const gitFolder = path.join(repoPath, ".git");

    if (await this._exists(repoPath)) {
      if (!(await this._exists(gitFolder))) {
        container.logger?.warn?.(
          `[Downloader] ${name} exists at ${repoPath} but is not a valid git repository. Cleaning up...`,
        );
        await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});
      }
    }


    const isExisting =
      (await this._exists(repoPath)) && (await this._exists(gitFolder));

    if (isExisting) {
      container.logger?.info?.(`[Downloader] Updating repo: ${name}`);
      const pullArgs =
        branch === "default"
          ? ["-C", repoPath, "pull"]
          : ["-C", repoPath, "pull", "origin", branch];
      await execGit(pullArgs).catch(async () => {
        container.logger?.warn?.(
          `[Downloader] Git pull failed for ${name}, attempting clean clone fallback...`,
        );
        await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});
        const cloneArgs = ["clone"];
        if (branch !== "default") cloneArgs.push("-b", branch);
        cloneArgs.push("--", url, repoPath);
        await execGit(cloneArgs).catch(async (cloneErr) => {
          await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});
          execError("Git clone failed")(cloneErr);
        });
      });
    } else {
      container.logger?.info?.(`[Downloader] Cloning repo: ${url}`);
      await fs.mkdir(MODULE_ROOT, { recursive: true });
      const cloneArgs = ["clone"];
      if (branch !== "default") cloneArgs.push("-b", branch);
      cloneArgs.push("--", url, repoPath);
      await execGit(cloneArgs).catch(async () => {
        await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});
        throw new Error("Git clone failed");
      });
    }



  }

  public async getModulesInRepo(repoName: string): Promise<ModuleInfo[]> {
    repoName = repoSchema.parse(repoName);
    const repoPath = path.join(MODULE_ROOT, repoName);

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

  public async installModule(
    repoName: string,
    moduleName: string,
  ): Promise<ModuleInfo> {
    repoName = repoSchema.parse(repoName);
    moduleName = repoSchema.parse(moduleName);

    const sourcePath = path.join(MODULE_ROOT, repoName, moduleName);
    const targetPath = path.join(ADDON_MODULES_ROOT, moduleName);

    if (!(await this._exists(sourcePath))) {
      throw new Error(`Module ${moduleName} not found in repo ${repoName}`);
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
        version: info.version || "1.0.0",
        disableable: true,
        dependencies: info.dependencies || [],
        conflicts: info.conflicts || [],
        configOverrides: false,
        targetService: "worker",
        subStores: await detectSubStores(sourcePath),
        configFields: [],
      };
      await writeManifest(sourcePath, manifest);
    }

    await fs.mkdir(ADDON_MODULES_ROOT, { recursive: true });

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

      await execFileAsync("bun", ["add", ...reqs], { cwd: sourcePath, timeout: 60000 }).catch(
        execError("Requirement installation failed"),
      );

      // The synthetic package.json above becomes the nearest package boundary
      // for this addon's files, which stops Node/Bun's specifier resolution
      // from walking up any further - silently breaking both the legacy
      // `#core/#lib/#utilities` aliases and the `"lumi"` self-reference
      // (root's package.json, name "lumi", is now unreachable). Symlinking
      // "lumi" straight into this addon's own node_modules restores it via a
      // normal node_modules lookup instead of the walk-up.
      const nodeModulesLumiPath = path.join(sourcePath, "node_modules", "lumi");
      if (!(await this._exists(nodeModulesLumiPath))) {
        await fs.mkdir(path.join(sourcePath, "node_modules"), {
          recursive: true,
        });
        await fs
          .symlink(process.cwd(), nodeModulesLumiPath, "dir")
          .catch(() => {});
      }
    }

    await fs.rm(targetPath, { recursive: true, force: true }).catch(() => {});
    await fs.symlink(sourcePath, targetPath, "dir");

    container.logger?.info?.(
      `[Downloader] Installed ${moduleName} from ${repoName}`,
    );

    return info;
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

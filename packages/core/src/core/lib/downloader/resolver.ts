import { container } from "@sapphire/framework";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ModuleInfo } from "./types.js";
import { z } from "zod";
import { logError } from "#utilities/errors.js";

const execFileAsync = promisify(execFile);

// Disallow dots to prevent traversal, and a leading `-` so a value can never be
// parsed as a flag when spread into an execFile() argv (argument injection).
const repoSchema = z.string().regex(/^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/);
const branchSchema = z.string().regex(/^[a-zA-Z0-9_.][a-zA-Z0-9_.-]*$/);
const urlSchema = z.string().refine(
  (val) => {
    if (val.startsWith("http://") || val.startsWith("https://")) {
      try {
        new URL(val);
        return true;
      } catch {
        return false;
      }
    }
    if (val.startsWith("file://")) {
      return true;
    }
    const sshRegex = /^git@[a-zA-Z0-9.-]+:[a-zA-Z0-9._\/-]+(?:\.git)?$/i;
    const sshUrlRegex =
      /^ssh:\/\/git@[a-zA-Z0-9.-]+(?::[0-9]+)?\/[a-zA-Z0-9._\/-]+(?:\.git)?$/i;
    return sshRegex.test(val) || sshUrlRegex.test(val);
  },
  {
    message:
      "Must be a valid HTTP/HTTPS URL, file URL, or Git SSH URL (git@github.com:owner/repo.git)",
  },
);
// Same leading-dash guard: a requirement must not start with `-` or it could be
// interpreted as a flag to `bun add`.
const reqsSchema = z.array(z.string().regex(/^[a-zA-Z0-9_.@/][a-zA-Z0-9_.@/-]*$/));

export const MODULE_ROOT = path.join(process.cwd(), "data", "3rd-party-modules");
/** Where symlinks for installed addons live — registered as a second ModuleStore root. */
export const ADDON_MODULES_ROOT = path.join(process.cwd(), "data", "installed-modules");

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
    url = urlSchema.parse(url);
    branch = branchSchema.parse(branch);

    const repoPath = path.join(MODULE_ROOT, name);

    // Clone or pull
    if (await this._exists(repoPath)) {
      container.logger.info(`[Downloader] Updating repo: ${name}`);
      const pullArgs = branch !== "default" ? ["-C", repoPath, "pull", "origin", branch] : ["-C", repoPath, "pull"];
      await execFileAsync("git", pullArgs).catch((err: NodeJS.ErrnoException & { stderr?: string }) => {
        throw new Error(`Git pull failed: ${(err.stderr ?? err.message).trim()}`);
      });
    } else {
      container.logger.info(`[Downloader] Cloning repo: ${url}`);
      const cloneArgs = ["clone"];
      if (branch !== "default") cloneArgs.push("-b", branch);
      // `--` terminates option parsing: url/repoPath can never be read as flags.
      cloneArgs.push("--", url, repoPath);
      await execFileAsync("git", cloneArgs).catch((err: NodeJS.ErrnoException & { stderr?: string }) => {
        throw new Error(`Git clone failed: ${(err.stderr ?? err.message).trim()}`);
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

    // Fast path: root-level modules.json index
    const indexPath = path.join(repoPath, "modules.json");
    if (await this._exists(indexPath)) {
      try {
        const index = JSON.parse(await fs.readFile(indexPath, "utf8")) as {
          modules?: ModuleInfo[];
        };
        if (Array.isArray(index.modules)) return index.modules;
      } catch (err: unknown) {
        container.logger.warn(
          `[Downloader] Failed to parse modules.json in ${repoName}, falling back to scan:`,
          err,
        );
      }
    }

    // Fallback: walk subdirectories for info.json files
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
          container.logger.warn(
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
    moduleName = repoSchema.parse(moduleName); // Reuse repoSchema for module names

    const sourcePath = path.join(MODULE_ROOT, repoName, moduleName);
    const targetPath = path.join(ADDON_MODULES_ROOT, moduleName);

    if (!(await this._exists(sourcePath))) {
      throw new Error(`Module ${moduleName} not found in repo ${repoName}`);
    }

    // Read info.json for requirements
    const infoPath = path.join(sourcePath, "info.json");
    if (!(await this._exists(infoPath))) {
      throw new Error(`Module ${moduleName} has no info.json — cannot install`);
    }
    const info = JSON.parse(await fs.readFile(infoPath, "utf8")) as ModuleInfo;

    // Ensure the installed-modules root exists
    await fs.mkdir(ADDON_MODULES_ROOT, { recursive: true });

    // Install npm requirements if any
    if (info.requirements?.length) {
      container.logger.info(
        `[Downloader] Installing isolated requirements for ${moduleName}: ${info.requirements.join(", ")}`,
      );
      const reqs = reqsSchema.parse(info.requirements);

      // Ensure local package.json exists inside the module folder for isolated dependency installation
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

      // Run 'bun add' inside the module's own folder to keep dependencies completely isolated
      await execFileAsync("bun", ["add", ...reqs], { cwd: sourcePath }).catch(
        (err: NodeJS.ErrnoException & { stderr?: string }) => {
          throw new Error(
            `Requirement installation failed: ${(err.stderr ?? err.message).trim()}`,
          );
        },
      );
    }

    // Symlink into the installed-modules root so ModuleStore discovers it.
    if (await this._exists(targetPath)) {
      await fs.unlink(targetPath);
    }
    await fs.symlink(sourcePath, targetPath, "dir");

    container.logger.info(
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
        (err as { code: unknown }).code !== "ENOENT"
      ) {
        logError("DownloaderResolver._exists", err);
      }
      return false;
    }
  }
}

export const resolver = new DownloadResolver();

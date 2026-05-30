import { container } from "@sapphire/framework";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ModuleInfo } from "./types.js";
import { z } from "zod";
import { logError } from "#utilities/errors.js";

const repoSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/); // Disallow dots to prevent traversal
const branchSchema = z.string().regex(/^[a-zA-Z0-9_.-]+$/);
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
const reqsSchema = z.array(z.string().regex(/^[a-zA-Z0-9_.@/-]+$/));

const MODULE_ROOT = path.join(process.cwd(), "data", "3rd-party-modules");

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
      const pullArgs = ["git", "-C", repoPath, "pull"];
      if (branch !== "default") pullArgs.push("origin", branch);
      const pullProc = Bun.spawn(pullArgs, { stdout: "pipe", stderr: "pipe" });
      const pullCode = await pullProc.exited;
      if (pullCode !== 0) {
        const stderr = await new Response(pullProc.stderr).text();
        throw new Error(`Git pull failed (exit ${pullCode}): ${stderr.trim()}`);
      }
    } else {
      container.logger.info(`[Downloader] Cloning repo: ${url}`);
      const cloneArgs = ["git", "clone"];
      if (branch !== "default") cloneArgs.push("-b", branch);
      cloneArgs.push(url, repoPath);
      const cloneProc = Bun.spawn(cloneArgs, {
        stdout: "pipe",
        stderr: "pipe",
      });
      const cloneCode = await cloneProc.exited;
      if (cloneCode !== 0) {
        const stderr = await new Response(cloneProc.stderr).text();
        throw new Error(
          `Git clone failed (exit ${cloneCode}): ${stderr.trim()}`,
        );
      }
    }
  }

  public async getModulesInRepo(repoName: string): Promise<ModuleInfo[]> {
    repoName = repoSchema.parse(repoName);
    const repoPath = path.join(MODULE_ROOT, repoName);
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
  ): Promise<void> {
    repoName = repoSchema.parse(repoName);
    moduleName = repoSchema.parse(moduleName); // Reuse repoSchema for module names

    const sourcePath = path.join(MODULE_ROOT, repoName, moduleName);
    const targetPath = path.join(
      process.cwd(),
      "packages",
      "core",
      "src",
      "modules",
      moduleName,
    );

    if (!(await this._exists(sourcePath))) {
      throw new Error(`Module ${moduleName} not found in repo ${repoName}`);
    }

    // Read info.json for requirements
    const infoPath = path.join(sourcePath, "info.json");
    const info = JSON.parse(await fs.readFile(infoPath, "utf8")) as ModuleInfo;

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
      const addProc = Bun.spawn(["bun", "add", ...reqs], {
        cwd: sourcePath,
        stdout: "pipe",
        stderr: "pipe",
      });
      const addCode = await addProc.exited;
      if (addCode !== 0) {
        const stderr = await new Response(addProc.stderr).text();
        throw new Error(
          `Requirement installation failed (exit ${addCode}): ${stderr.trim()}`,
        );
      }
    }

    // Create a symlink from data/ to src/modules/
    // This allows the ModuleManager to discover it naturally.
    if (await this._exists(targetPath)) {
      await fs.rm(targetPath, { recursive: true, force: true });
    }
    await fs.symlink(sourcePath, targetPath, "dir");

    container.logger.info(
      `[Downloader] Installed ${moduleName} from ${repoName}`,
    );
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

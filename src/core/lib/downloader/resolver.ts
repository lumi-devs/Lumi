import { container } from "@sapphire/framework";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ModuleInfo } from "./types.js";
import { z } from "zod";

const repoSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/); // Disallow dots to prevent traversal
const branchSchema = z.string().regex(/^[a-zA-Z0-9_.-]+$/);
const urlSchema = z.string().url();
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
    branch = "master",
  ): Promise<void> {
    name = repoSchema.parse(name);
    url = urlSchema.parse(url);
    branch = branchSchema.parse(branch);

    const repoPath = path.join(MODULE_ROOT, name);

    // Clone or pull
    if (await this._exists(repoPath)) {
      container.logger.info(`[Downloader] Updating repo: ${name}`);
      const proc = Bun.spawn(
        ["git", "-C", repoPath, "pull", "origin", branch],
        { stdout: "pipe", stderr: "pipe" },
      );
      const code = await proc.exited;
      if (code !== 0) throw new Error(`Git pull failed with code ${code}`);
    } else {
      container.logger.info(`[Downloader] Cloning repo: ${url}`);
      const proc = Bun.spawn(["git", "clone", "-b", branch, url, repoPath], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const code = await proc.exited;
      if (code !== 0) throw new Error(`Git clone failed with code ${code}`);
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
    const targetPath = path.join(process.cwd(), "src", "modules", moduleName);

    if (!(await this._exists(sourcePath))) {
      throw new Error(`Module ${moduleName} not found in repo ${repoName}`);
    }

    // Read info.json for requirements
    const infoPath = path.join(sourcePath, "info.json");
    const info = JSON.parse(await fs.readFile(infoPath, "utf8")) as ModuleInfo;

    // Install npm requirements if any
    if (info.requirements?.length) {
      container.logger.info(
        `[Downloader] Installing requirements for ${moduleName}: ${info.requirements.join(", ")}`,
      );
      const reqs = reqsSchema.parse(info.requirements);
      const proc = Bun.spawn(["bun", "add", ...reqs], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const code = await proc.exited;
      if (code !== 0)
        throw new Error(`Requirement installation failed with code ${code}`);
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
    } catch {
      return false;
    }
  }
}

export const resolver = new DownloadResolver();

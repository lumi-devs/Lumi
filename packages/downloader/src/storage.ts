import { randomUUID } from "node:crypto";
import { lstatSync } from "node:fs";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { type ModuleManifest, validateManifest } from "@lumi/module-runtime";
import { RequirementRe } from "./validate.js";

export class AddonStorage {
  readonly reposDir: string;
  readonly addonsDir: string;
  readonly backupsDir: string;

  constructor(root: string) {
    this.reposDir = join(root, "data", "repos");
    this.addonsDir = join(root, "data", "addons");
    this.backupsDir = join(root, "data", "addon-backups");
  }

  private namePath(root: string, name: string): string {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      throw new Error(`Invalid storage name "${name}".`);
    }
    return join(root, name);
  }

  repoDir(name: string): string {
    return this.namePath(this.reposDir, name);
  }

  addonDir(name: string): string {
    return this.namePath(this.addonsDir, name);
  }

  backupDir(name: string): string {
    return this.namePath(this.backupsDir, name);
  }

  async readManifest(dir: string): Promise<ModuleManifest> {
    return validateManifest(
      JSON.parse(await readFile(join(dir, "manifest.json"), "utf-8")),
    );
  }

  async copyModule(source: string, target: string): Promise<void> {
    await rm(target, { recursive: true, force: true });
    await cp(source, target, {
      recursive: true,
      force: true,
      filter: (path) => {
        const name = basename(path);
        if (name === "node_modules" || name === ".git") return false;
        if (lstatSync(path).isSymbolicLink()) {
          throw new Error("Symbolic links are not allowed in add-ons.");
        }
        return true;
      },
    });
  }

  async stageModule(source: string): Promise<string> {
    const stagingRoot = join(this.addonsDir, ".staging");
    await mkdir(stagingRoot, { recursive: true });
    const staging = join(stagingRoot, `${basename(source)}-${randomUUID()}`);
    try {
      await this.copyModule(source, staging);
      return staging;
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    }
  }

  async commitModule(staging: string, target: string): Promise<void> {
    await rm(target, { recursive: true, force: true });
    await rename(staging, target);
  }

  async installRequirements(
    dir: string,
    requirements: string[],
    packageName: string,
  ): Promise<void> {
    for (const requirement of requirements) {
      if (!RequirementRe.test(requirement)) {
        throw new Error(`Invalid dependency spec "${requirement}".`);
      }
    }
    if (requirements.length === 0) return;

    const packagePath = join(dir, "package.json");
    await writeFile(
      packagePath,
      JSON.stringify(
        {
          name: `lumi-addon-${packageName}`,
          version: "1.0.0",
          private: true,
        },
        null,
        2,
      ),
    );

    const proc = Bun.spawn(
      [
        "bun",
        "add",
        "--production",
        "--ignore-scripts",
        "--no-save",
        ...requirements,
      ],
      { cwd: dir, stdout: "ignore", stderr: "pipe" },
    );
    const [stderr, exitCode] = await Promise.all([
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (exitCode !== 0) {
      throw new Error(
        `Dependency install failed: ${stderr.trim() || `exit code ${exitCode}`}`,
      );
    }
  }
}

import { createModuleLoader, type ModuleManifest } from "@lumi/module-runtime";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { cp, mkdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";

export interface AddonSource {
  type: "github" | "npm" | "local";
  url: string;
  ref?: string; // branch, tag, or version
}

export interface InstallResult {
  success: boolean;
  name: string;
  version: string;
  path: string;
  error?: string;
}

export class AddonInstaller {
  private readonly addonsDir: string;
  private readonly moduleLoader: ReturnType<typeof createModuleLoader>;
  private services: Record<string, unknown> = {};
  private addonRootAdded = false;

  constructor(addonsDir: string, moduleLoader: ReturnType<typeof createModuleLoader>) {
    this.addonsDir = addonsDir;
    this.moduleLoader = moduleLoader;
  }

  bindServices(services: Record<string, unknown>): void {
    this.services = services;
  }

  async install(source: AddonSource): Promise<InstallResult> {
    const tempDir = join(tmpdir(), `lumi-addon-${Date.now()}`);
    
    try {
      await mkdir(tempDir, { recursive: true });

      let sourceDir = tempDir;
      if (source.type === "github") {
        await this.cloneGitHub(source, tempDir);
      } else if (source.type === "npm") {
        sourceDir = await this.installNpm(source, tempDir);
      } else if (source.type === "local") {
        sourceDir = await this.resolveLocal(source);
      }

      const manifest = await this.validateManifest(sourceDir);
      
      // Check conflicts
      const conflicts = await this.checkConflicts(manifest);
      if (conflicts.length > 0) {
        return {
          success: false,
          name: manifest.name,
          version: manifest.version,
          path: "",
          error: `Conflicts with: ${conflicts.join(", ")}`,
        };
      }

      // Install to addons directory
      const targetDir = join(this.addonsDir, manifest.name);
      await rm(targetDir, { recursive: true, force: true });
      await mkdir(targetDir, { recursive: true });
      
      await this.copyDirectory(sourceDir, targetDir);

      if (manifest.requirements.length > 0) {
        await this.installDependencies(targetDir, manifest.requirements);
      }

      if (!this.addonRootAdded) {
        this.moduleLoader.addRoot(this.addonsDir, "addon");
        this.addonRootAdded = true;
      }
      const discovered = await this.moduleLoader.discover();
      await this.moduleLoader.loadAll(
        discovered.filter((module) => module.manifest.name === manifest.name),
        this.services,
      );

      return {
        success: true,
        name: manifest.name,
        version: manifest.version,
        path: targetDir,
      };
    } catch (error) {
      return {
        success: false,
        name: "",
        version: "",
        path: "",
        error: String(error),
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private async cloneGitHub(source: AddonSource, targetDir: string): Promise<void> {
    const url = source.url.endsWith(".git") ? source.url : `${source.url}.git`;
    if (!/^(https:\/\/|git@)/.test(url)) {
      throw new Error("GitHub add-ons must use an https:// or git@ URL.");
    }
    const ref = source.ref ?? "main";
    execFileSync("git", ["clone", "--depth", "1", "--branch", ref, url, "."], {
      cwd: targetDir,
      stdio: "ignore",
    });
  }

  private async installNpm(source: AddonSource, tempDir: string): Promise<string> {
    const name = source.url.trim();
    if (!/^(@[a-z0-9-._~]+\/)?[a-z0-9-._~]+$/i.test(name)) {
      throw new Error("npm add-ons must use a package name; put the version in the ref field.");
    }
    const spec = source.ref ? `${name}@${source.ref}` : name;
    execFileSync("bun", ["add", spec], { cwd: tempDir, stdio: "ignore" });
    return join(tempDir, "node_modules", ...name.split("/"));
  }

  private async resolveLocal(source: AddonSource): Promise<string> {
    const dir = resolve(source.url);
    const info = await stat(dir).catch(() => null);
    if (!info?.isDirectory()) {
      throw new Error("Local add-on path is not a directory.");
    }
    return dir;
  }

  private async validateManifest(dir: string): Promise<ModuleManifest> {
    return JSON.parse(await readFile(join(dir, "manifest.json"), "utf-8"));
  }

  private async checkConflicts(manifest: ModuleManifest): Promise<string[]> {
    const conflicts: string[] = [];
    for (const module of this.moduleLoader.listAll()) {
      if (module.manifest.conflicts.includes(manifest.name) || manifest.conflicts.includes(module.manifest.name)) {
        conflicts.push(module.manifest.name);
      }
    }
    return conflicts;
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
    await cp(src, dest, {
      recursive: true,
      force: true,
      filter: (path) => !path.includes("/node_modules") && !path.includes("/.git"),
    });
  }

  private async installDependencies(dir: string, requirements: string[]): Promise<void> {
    for (const requirement of requirements) {
      if (!/^(@[a-z0-9-._~]+\/)?[a-z0-9-._~]+(@[^\s]+)?$/i.test(requirement)) continue;
      execFileSync(
        "bun",
        ["add", "--production", "--ignore-scripts", "--no-save", requirement],
        { cwd: dir, stdio: "ignore" },
      );
    }
  }

  async uninstall(name: string): Promise<boolean> {
    const targetDir = join(this.addonsDir, name);
    try {
      await rm(targetDir, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  async listInstalled(): Promise<Array<{ name: string; version: string; path: string }>> {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(this.addonsDir, { withFileTypes: true });
    
    const addons = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(this.addonsDir, entry.name, "manifest.json");
      try {
        const content = await import("node:fs/promises").then(fs => fs.readFile(manifestPath, "utf-8"));
        const manifest = JSON.parse(content);
        addons.push({ name: manifest.name, version: manifest.version, path: join(this.addonsDir, entry.name) });
      } catch {
        // Invalid addon, skip
      }
    }
    return addons;
  }
}
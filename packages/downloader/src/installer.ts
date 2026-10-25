import { createModuleLoader, type ModuleManifest } from "@lumi/module-runtime";
import { join } from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";
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

  constructor(addonsDir: string, moduleLoader: ReturnType<typeof createModuleLoader>) {
    this.addonsDir = addonsDir;
    this.moduleLoader = moduleLoader;
  }

  async install(source: AddonSource): Promise<InstallResult> {
    const tempDir = join(tmpdir(), `lumi-addon-${Date.now()}`);
    
    try {
      await mkdir(tempDir, { recursive: true });

      if (source.type === "github") {
        await this.cloneGitHub(source, tempDir);
      } else if (source.type === "npm") {
        await this.installNpm(source, tempDir);
      } else if (source.type === "local") {
        await this.copyLocal(source, tempDir);
      }

      // Validate manifest
      const manifest = await this.validateManifest(tempDir);
      
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
      
      // Copy files (excluding node_modules, .git, etc.)
      await this.copyDirectory(tempDir, targetDir);

      // Install npm dependencies if any
      if (manifest.requirements.length > 0) {
        await this.installDependencies(targetDir, manifest.requirements);
      }

      // Reload module loader
      this.moduleLoader.addRoot(this.addonsDir, "addon");
      const discovered = await this.moduleLoader.discover();
      await this.moduleLoader.loadAll(discovered, {} as any);

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
    const { execSync } = await import("node:child_process");
    const url = source.url.endsWith(".git") ? source.url : `${source.url}.git`;
    const ref = source.ref ?? "main";
    
    execSync(`git clone --depth 1 --branch ${ref} ${url} .`, { 
      cwd: targetDir, 
      stdio: "ignore" 
    });
  }

  private async installNpm(source: AddonSource, targetDir: string): Promise<void> {
    const { execSync } = await import("node:child_process");
    const pkg = source.url + (source.ref ? `@${source.ref}` : "");
    
    execSync(`bun add ${pkg}`, { 
      cwd: targetDir, 
      stdio: "ignore" 
    });
    
    // Extract the package
    execSync(`bun pm cache dir`, { cwd: targetDir });
  }

  private async copyLocal(source: AddonSource, targetDir: string): Promise<void> {
    const { execSync } = await import("node:child_process");
    execSync(`cp -r ${source.url}/* .`, { cwd: targetDir });
  }

  private async validateManifest(dir: string): Promise<ModuleManifest> {
    const manifestPath = join(dir, "manifest.json");
    const content = await import("node:fs/promises").then(fs => fs.readFile(manifestPath, "utf-8"));
    return JSON.parse(content);
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
    const { readdir, copyFile, stat, mkdir } = await import("node:fs/promises");
    const entries = await readdir(src, { withFileTypes: true });
    
    await mkdir(dest, { recursive: true });
    
    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);
      
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      
      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await copyFile(srcPath, destPath);
      }
    }
  }

  private async installDependencies(dir: string, requirements: string[]): Promise<void> {
    const { execSync } = await import("node:child_process");
    for (const req of requirements) {
      execSync(`bun add ${req}`, { cwd: dir, stdio: "ignore" });
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
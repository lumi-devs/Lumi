import { validateManifest, type ModuleManifest } from "@lumi/module-runtime";

export interface ValidationResult {
  valid: boolean;
  manifest?: ModuleManifest;
  errors: string[];
}

export class AddonValidator {
  static async validate(dir: string): Promise<ValidationResult> {
    const errors: string[] = [];
    
    try {
      const manifest = await this.validateManifest(dir);
      
      // Check entry file exists
      const { join } = await import("node:path");
      const { stat } = await import("node:fs/promises");
      const entryPath = join(dir, manifest.entry);
      
      try {
        await stat(entryPath);
      } catch {
        errors.push(`Entry file not found: ${manifest.entry}`);
      }
      
      // Check requirements format
      for (const req of manifest.requirements) {
        if (!/^[@a-z][\w.-]*@[\w.^-]+$/.test(req) && !/^[@a-z][\w.-]*$/.test(req)) {
          errors.push(`Invalid requirement format: ${req}`);
        }
      }
      
      return {
        valid: errors.length === 0,
        manifest,
        errors,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [String(error)],
      };
    }
  }

  private static async validateManifest(dir: string): Promise<ModuleManifest> {
    const { join } = await import("node:path");
    const { readFile } = await import("node:fs/promises");
    const manifestPath = join(dir, "manifest.json");
    const content = await readFile(manifestPath, "utf-8");
    return validateManifest(JSON.parse(content));
  }
}
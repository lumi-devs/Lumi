import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { safeParseManifest, type ModuleManifest } from "./manifest.ts";

export type ModuleOrigin = "bundled" | "addon";

export interface ModuleRoot {
  path: string;
  origin: ModuleOrigin;
}

export interface DiscoveredModule {
  manifest: ModuleManifest;
  dir: string;
  entry: string;
  origin: ModuleOrigin;
}

export interface BrokenModule {
  dir: string;
  origin: ModuleOrigin;
  issues: string[];
}

export interface DiscoveryResult {
  modules: DiscoveredModule[];
  broken: BrokenModule[];
}

const Skip = new Set(["node_modules", ".git", "dist", "build", ".versions", "tests"]);

function inside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export async function discoverModules(roots: readonly ModuleRoot[]): Promise<DiscoveryResult> {
  const modules: DiscoveredModule[] = [];
  const broken: BrokenModule[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    const entries = await readdir(root.path, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name.startsWith("_") || Skip.has(entry.name)) continue;
      const dir = path.join(root.path, entry.name);
      const info = await stat(dir).catch(() => null);
      if (!info?.isDirectory()) continue;

      const manifestPath = path.join(dir, "manifest.json");
      const raw = await readFile(manifestPath, "utf8").catch(() => null);
      if (raw === null) {
        broken.push({ dir, origin: root.origin, issues: ["missing manifest.json"] });
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        broken.push({
          dir,
          origin: root.origin,
          issues: [`manifest.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`],
        });
        continue;
      }

      const result = safeParseManifest(parsed);
      if (!result.ok) {
        broken.push({ dir, origin: root.origin, issues: result.issues });
        continue;
      }

      const manifest = result.manifest;
      if (manifest.name !== entry.name) {
        broken.push({
          dir,
          origin: root.origin,
          issues: [`manifest name '${manifest.name}' does not match directory '${entry.name}'`],
        });
        continue;
      }
      if (seen.has(manifest.name)) {
        broken.push({ dir, origin: root.origin, issues: [`duplicate module '${manifest.name}'`] });
        continue;
      }

      const entryPath = path.resolve(dir, manifest.entry);
      if (!inside(dir, entryPath)) {
        broken.push({
          dir,
          origin: root.origin,
          issues: [`entry '${manifest.entry}' escapes the module directory`],
        });
        continue;
      }
      const entryInfo = await stat(entryPath).catch(() => null);
      if (!entryInfo?.isFile()) {
        broken.push({ dir, origin: root.origin, issues: [`entry '${manifest.entry}' does not exist`] });
        continue;
      }

      seen.add(manifest.name);
      modules.push({ manifest, dir, entry: entryPath, origin: root.origin });
    }
  }

  return { modules, broken };
}

import { promises as fs } from "node:fs";
import path from "node:path";
import { fieldsFromSchema } from "./config-schema.js";
import type { ModuleMeta, ModuleOptions } from "./Module.js";
import {
  KNOWN_SUBSTORES,
  type ModuleManifest,
  type TargetService,
} from "@lumi/contracts";

// Manifest types live in @lumi/contracts (shared with the dashboard); re-exported
// here so existing `./manifest.js` importers keep resolving them.
export { KNOWN_SUBSTORES, type ModuleManifest, type TargetService };

// ─────────────────────────────────────────────────────────────────────────────
// Static module manifest.
//
// `manifest.json` is the declarative contract for a module: it carries everything
// discovery needs (identity, deps, conflicts, declared sub-stores, target service,
// and the derived `configFields`) WITHOUT executing any module code. `discover()`
// reads it directly so the gateway/worker split can answer "which service loads
// which module?" and so importing discord.js inside a worker can never crash
// discovery. The Zod `configSchema` stays in code (index.ts) and is resolved
// lazily only when a config write needs to validate against it.
// ─────────────────────────────────────────────────────────────────────────────

export const MANIFEST_FILE = "manifest.json";

/** Detect which known sub-store directories exist inside a module dir. */
export async function detectSubStores(dir: string): Promise<string[]> {
  const present: string[] = [];
  for (const name of KNOWN_SUBSTORES) {
    const stat = await fs.stat(path.join(dir, name)).catch(() => null);
    if (stat?.isDirectory()) present.push(name);
  }
  return present;
}

/** Build a serialisable manifest from a module's in-code `meta`. */
export async function manifestFromMeta(
  meta: ModuleMeta | ModuleOptions,
  dir: string,
): Promise<ModuleManifest> {
  const configFields =
    meta.configFields ??
    (meta.configSchema ? fieldsFromSchema(meta.configSchema) : []);

  return {
    name: meta.name!,
    displayName: meta.displayName ?? meta.name!,
    emoji: meta.emoji ?? "⚙️",
    description: meta.description ?? "",
    version: meta.version ?? "0.0.0",
    isCore: meta.isCore ?? false,
    dependencies: meta.dependencies ?? [],
    conflicts: meta.conflicts ?? [],
    configOverrides: meta.configOverrides ?? false,
    targetService: "worker",
    subStores: await detectSubStores(dir),
    configFields,
  };
}

/** Build a runtime `ModuleMeta` from a static manifest (no `configSchema`). */
export function metaFromManifest(manifest: ModuleManifest): ModuleMeta {
  return {
    name: manifest.name,
    displayName: manifest.displayName,
    emoji: manifest.emoji,
    description: manifest.description,
    version: manifest.version,
    isCore: manifest.isCore ?? false,
    dependencies: manifest.dependencies ?? [],
    conflicts: manifest.conflicts ?? [],
    configOverrides: manifest.configOverrides ?? false,
    configFields: manifest.configFields ?? [],
  };
}

/** Read & parse a module's `manifest.json`, or `null` if absent/invalid. */
export async function readManifest(
  dir: string,
): Promise<ModuleManifest | null> {
  const file = path.join(dir, MANIFEST_FILE);
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as ModuleManifest;
  } catch {
    return null;
  }
}

export async function writeManifest(
  dir: string,
  manifest: ModuleManifest,
): Promise<void> {
  const file = path.join(dir, MANIFEST_FILE);
  await fs.writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

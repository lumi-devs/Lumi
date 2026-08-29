import { promises as fs } from "node:fs";
import path from "node:path";
import { fieldsFromSchema } from "./config-schema.js";
import type { ModuleMeta, ModuleOptions } from "./Module.js";
import { CoreVersion } from "#utilities/misc.js";
import {
  KNOWN_SUBSTORES,
  type ModuleManifest,
  type TargetService,
} from "@lumi/contracts";

export { KNOWN_SUBSTORES, type ModuleManifest, type TargetService };

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
    short: meta.short,
    endUserDataStatement: meta.endUserDataStatement,
    version: meta.version ?? CoreVersion,
    disableable: meta.disableable ?? true,
    dependencies: meta.dependencies ?? [],
    conflicts: meta.conflicts ?? [],
    configOverrides: meta.configOverrides ?? false,
    targetService: "worker",
    subStores: await detectSubStores(dir),
    configFields,
    category: meta.category,
    dashboardHref: meta.dashboardHref,
  };
}

/** Build a runtime `ModuleMeta` from a static manifest (no `configSchema`). */
export function metaFromManifest(manifest: ModuleManifest): ModuleMeta {
  return {
    name: manifest.name,
    displayName: manifest.displayName,
    emoji: manifest.emoji,
    description: manifest.description,
    short: manifest.short,
    endUserDataStatement: manifest.endUserDataStatement,
    version: manifest.version,
    disableable: manifest.disableable ?? true,
    dependencies: manifest.dependencies ?? [],
    conflicts: manifest.conflicts ?? [],
    configOverrides: manifest.configOverrides ?? false,
    configFields: manifest.configFields ?? [],
    category: manifest.category,
    dashboardHref: manifest.dashboardHref,
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

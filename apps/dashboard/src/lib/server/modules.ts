import type { Dirent } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getPrisma } from "./prisma";
import { serverConfig } from "./env";

export type ConfigFieldType =
  | "boolean"
  | "number"
  | "string"
  | "channel"
  | "role"
  | "multi-channel"
  | "multi-role"
  | "json"
  | "select"
  | "multi-string";

export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  description?: string;
  required?: boolean;
  default?: unknown;
  choices?: string[];
  category?: string;
  min?: number;
  max?: number;
}

export interface CatalogModule {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  version: string;
  configKey: string;
  configFields: ConfigField[];
  source: "bundled" | "addon" | "registry";
}

interface RawManifest {
  name?: unknown;
  displayName?: unknown;
  emoji?: unknown;
  description?: unknown;
  version?: unknown;
  configKey?: unknown;
  configFields?: unknown;
}

const FieldTypes = new Set<ConfigFieldType>([
  "boolean",
  "number",
  "string",
  "channel",
  "role",
  "multi-channel",
  "multi-role",
  "json",
  "select",
  "multi-string",
]);

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function parseFields(value: unknown): ConfigField[] {
  if (!Array.isArray(value)) return [];
  const fields: ConfigField[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const raw = row as Record<string, unknown>;
    const key = typeof raw.key === "string" ? raw.key : null;
    const label = typeof raw.label === "string" ? raw.label : null;
    const type =
      typeof raw.type === "string" &&
      FieldTypes.has(raw.type as ConfigFieldType)
        ? (raw.type as ConfigFieldType)
        : null;
    if (!key || !label || !type) continue;
    fields.push({
      key,
      label,
      type,
      ...(typeof raw.description === "string"
        ? { description: raw.description }
        : {}),
      ...(typeof raw.required === "boolean" ? { required: raw.required } : {}),
      ...(raw.default !== undefined ? { default: raw.default } : {}),
      ...(Array.isArray(raw.choices)
        ? { choices: raw.choices.filter((item) => typeof item === "string") }
        : {}),
      ...(typeof raw.category === "string" ? { category: raw.category } : {}),
      ...(typeof raw.min === "number" ? { min: raw.min } : {}),
      ...(typeof raw.max === "number" ? { max: raw.max } : {}),
    });
  }
  return fields;
}

async function exists(path: string): Promise<boolean> {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
}

async function candidateDir(paths: string[]): Promise<string | null> {
  for (const path of paths) {
    if (await exists(path)) return path;
  }
  return null;
}

async function modulesRoot(): Promise<string | null> {
  const configured = serverConfig().modulesDir;
  const cwd = process.cwd();
  return candidateDir(
    configured
      ? [resolve(configured)]
      : [
          resolve(cwd, "modules"),
          resolve(cwd, "../../modules"),
          resolve(cwd, "../modules"),
          resolve(cwd, "../../../modules"),
        ],
  );
}

async function dataRoot(): Promise<string | null> {
  const configured = serverConfig().dataDir;
  const cwd = process.cwd();
  return candidateDir([
    resolve(configured),
    resolve(cwd, "data"),
    resolve(cwd, "../../data"),
    resolve(cwd, "../data"),
  ]);
}

async function collectManifests(
  root: string,
  depth: number,
): Promise<Array<{ path: string; manifest: RawManifest }>> {
  const found: Array<{ path: string; manifest: RawManifest }> = [];
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (
      entry.name.startsWith(".") ||
      entry.name === "node_modules" ||
      entry.name === "data"
    ) {
      continue;
    }
    const dir = join(root, entry.name);
    const manifestPath = join(dir, "manifest.json");
    try {
      const manifest = JSON.parse(
        await readFile(manifestPath, "utf-8"),
      ) as RawManifest;
      if (typeof manifest.name === "string")
        found.push({ path: dir, manifest });
    } catch {
      // Not every directory is a module.
    }
    if (depth > 1) {
      found.push(...(await collectManifests(dir, depth - 1)));
    }
  }
  return found;
}

function toCatalogModule(
  raw: RawManifest,
  source: CatalogModule["source"],
): CatalogModule | null {
  if (typeof raw.name !== "string" || !/^[a-z][a-z0-9-]*$/.test(raw.name)) {
    return null;
  }
  return {
    name: raw.name,
    displayName: asString(raw.displayName, raw.name),
    emoji: asString(raw.emoji, "◆"),
    description: asString(raw.description, ""),
    version: asString(raw.version, "0.0.0"),
    configKey: asString(raw.configKey, raw.name),
    configFields: parseFields(raw.configFields),
    source,
  };
}

let cachedCatalog: { at: number; modules: CatalogModule[] } | null = null;

export async function moduleCatalog(): Promise<CatalogModule[]> {
  if (cachedCatalog && Date.now() - cachedCatalog.at < 15_000) {
    return cachedCatalog.modules;
  }

  const map = new Map<string, CatalogModule>();
  const bundledRoot = await modulesRoot();
  if (bundledRoot) {
    for (const { manifest } of await collectManifests(bundledRoot, 3)) {
      const module = toCatalogModule(manifest, "bundled");
      if (module && !map.has(module.name)) map.set(module.name, module);
    }
  }

  const addonRoot = await dataRoot();
  if (addonRoot) {
    const addonsDir = join(addonRoot, "addons");
    for (const { manifest } of await collectManifests(addonsDir, 2)) {
      const module = toCatalogModule(manifest, "addon");
      if (module && !map.has(module.name)) map.set(module.name, module);
    }
  }

  const rows = await getPrisma().downloaderModule.findMany({
    orderBy: { name: "asc" },
  });
  for (const row of rows) {
    if (map.has(row.name)) continue;
    map.set(row.name, {
      name: row.name,
      displayName: row.name,
      emoji: "🧩",
      description: "Installed from the add-on registry.",
      version: row.version ?? "0.0.0",
      configKey: row.name,
      configFields: [],
      source: "registry",
    });
  }

  const modules = Array.from(map.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
  cachedCatalog = { at: Date.now(), modules };
  return modules;
}

export async function findModule(name: string): Promise<CatalogModule | null> {
  return (await moduleCatalog()).find((module) => module.name === name) ?? null;
}

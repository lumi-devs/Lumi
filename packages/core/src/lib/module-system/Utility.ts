import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface UtilityContext {
  name: string;
}

export interface UtilityOptions {
  name?: string;
}

export interface Utilities {}

export interface UtilityDef {
  name: string;
  onLoad?: () => unknown;
  onUnload?: () => unknown;
  [key: string]: unknown;
}

export function defineUtility<D extends UtilityDef>(def: D): D {
  return def;
}

const utilityRegistry = new Map<string, UtilityDef>();
const utilityDirs = new Map<string, string[]>();

export function getUtility<K extends keyof Utilities>(name: K): Utilities[K] {
  const utility = tryGetUtility(name);
  if (!utility) throw new Error(`Utility "${String(name)}" is not loaded`);
  return utility;
}

export function tryGetUtility<K extends keyof Utilities>(
  name: K,
): Utilities[K] | undefined {
  return utilityRegistry.get(name) as Utilities[K] | undefined;
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts")
    ) {
      yield full;
    }
  }
}

export async function loadUtilities(moduleDir: string): Promise<void> {
  const names: string[] = [];
  for await (const file of walk(join(moduleDir, "utilities"))) {
    const mod = (await import(pathToFileURL(file).href)) as Record<
      string,
      unknown
    >;
    for (const value of Object.values(mod)) {
      if (typeof value !== "object" || value === null) continue;
      const def = value as UtilityDef;
      if (typeof def.name !== "string") continue;
      if (utilityRegistry.has(def.name)) continue;
      utilityRegistry.set(def.name, def);
      names.push(def.name);
      await def.onLoad?.();
    }
  }
  utilityDirs.set(moduleDir, names);
}

export async function unloadUtilitiesForDir(
  moduleDir: string,
): Promise<void> {
  const names = utilityDirs.get(moduleDir) ?? [];
  utilityDirs.delete(moduleDir);
  for (const name of names) {
    const instance = utilityRegistry.get(name);
    if (instance) {
      utilityRegistry.delete(name);
      await instance.onUnload?.();
    }
  }
}

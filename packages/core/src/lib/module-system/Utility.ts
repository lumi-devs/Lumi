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

export function defineUtility<D extends UtilityDef>(def: D): D & { __lumiUtility: true } {
  return { ...def, __lumiUtility: true as const };
}

const utilityRegistry = new Map<string, UtilityDef>();
const utilityOwners = new Map<string, Map<string, UtilityDef>>();

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

function isUtilityDef(value: unknown): value is UtilityDef {
  if (typeof value !== "object" || value === null) return false;
  const def = value as UtilityDef;
  return (
    (def as { __lumiUtility?: unknown }).__lumiUtility === true &&
    typeof def.name === "string"
  );
}

export async function loadUtilities(moduleDir: string): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(join(moduleDir, "utilities"), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries
    .filter((e) => e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".test.ts"))
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const mod = (await import(
      pathToFileURL(join(moduleDir, "utilities", entry.name)).href
    )) as Record<string, unknown>;
    for (const value of Object.values(mod)) {
      if (!isUtilityDef(value)) continue;
      const owners = utilityOwners.get(value.name) ?? new Map<string, UtilityDef>();
      if (utilityRegistry.has(value.name)) {
        console.warn(
          `[Utility] "${value.name}" from ${entry.name} collides with an already-loaded utility - last-wins.`,
        );
      }
      utilityRegistry.set(value.name, value);
      owners.set(moduleDir, value);
      utilityOwners.set(value.name, owners);
      await value.onLoad?.();
    }
  }
}

export async function unloadUtilitiesForDir(
  moduleDir: string,
): Promise<void> {
  for (const [name, owners] of utilityOwners) {
    if (!owners.delete(moduleDir)) continue;
    if (owners.size > 0) {
      const [last] = [...owners.values()].slice(-1);
      if (last) utilityRegistry.set(name, last);
      continue;
    }
    utilityOwners.delete(name);
    const instance = utilityRegistry.get(name);
    if (instance) {
      utilityRegistry.delete(name);
      await instance.onUnload?.();
    }
  }
}

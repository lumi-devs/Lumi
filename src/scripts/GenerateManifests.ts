#!/usr/bin/env bun
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  manifestFromMeta,
  writeManifest,
  type ModuleManifest,
} from "#src/lib/module-system/Manifest.js";
import type { ModuleDefinition, ModuleMeta } from "#src/lib/module-system/Meta.js";

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const ROOT = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));

export const DefaultModuleRoot = path.join(ROOT, "src/modules");

const ROOTS = [
  path.join(ROOT, "src/modules"),
  ...process.argv.slice(2).map((p) => path.resolve(p)),
];

async function exists(p: string): Promise<boolean> {
  return fs
    .access(p)
    .then(() => true)
    .catch(() => false);
}

async function findIndex(dir: string): Promise<string | null> {
  for (const c of ["Index.ts", "Index.js", "Index.mts"]) {
    const p = path.join(dir, c);
    if (await exists(p)) return p;
  }
  return null;
}

function extractMeta(mod: Record<string, unknown>): ModuleMeta | ModuleDefinition | null {
  const direct = (mod as { meta?: ModuleMeta }).meta;
  if (direct) return direct;
  const def = (mod as { default?: { meta?: ModuleMeta } }).default;
  if (def?.meta) return def.meta;
  for (const v of Object.values(mod)) {
    const m = (v as { meta?: ModuleMeta })?.meta;
    if (m) return m;
  }
  return null;
}

export async function walk(dir: string, out: { dir: string; index: string }[]) {
  const entries = await fs.readdir(dir).catch(() => [] as string[]);
  for (const name of entries) {
    if (name.startsWith("_") || name.startsWith(".")) continue;
    const sub = path.join(dir, name);
    const stat = await fs.stat(sub).catch(() => null);
    if (!stat?.isDirectory()) continue;
    const index = await findIndex(sub);
    if (index) out.push({ dir: sub, index });
    await walk(sub, out);
  }
}

async function main() {
  const targets: { dir: string; index: string }[] = [];
  for (const root of ROOTS) {
    if (await exists(root)) await walk(root, targets);
  }

  let written = 0;
  const seen = new Set<string>();
  for (const { dir, index } of targets) {
    let mod: Record<string, unknown>;
    try {
      mod = (await import(pathToFileURL(index).href)) as Record<string, unknown>;
    } catch (err) {
      console.warn(`${YELLOW}[manifest] skip (import failed): ${index}\n  ${String(err)}${RESET}`);
      continue;
    }
    const meta = extractMeta(mod);
    if (!meta?.name) continue;
    if (seen.has(meta.name)) {
      console.warn(`${YELLOW}[manifest] duplicate module name '${meta.name}' at ${dir} - skipped${RESET}`);
      continue;
    }
    seen.add(meta.name);

    const manifest: ModuleManifest = manifestFromMeta(meta);
    await writeManifest(dir, manifest);
    written++;
    console.log(`${DIM}[manifest]${RESET} ${GREEN}${meta.name}${RESET} → ${DIM}${path.relative(ROOT, dir)}/manifest.json${RESET}`);
  }
  console.log(`${GREEN}[manifest] wrote ${written} manifest(s).${RESET}`);
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    console.error(`${RED}❌ Manifest generation failed:${RESET}`, err);
    process.exit(1);
  });
}

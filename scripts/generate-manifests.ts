#!/usr/bin/env bun
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  manifestFromMeta,
  writeManifest,
  type ModuleManifest,
} from "#core/module-system/manifest.js";
import type { ModuleMeta, ModuleOptions } from "#core/module-system/Module.js";

// Build-time generator for per-module `manifest.json`. Imports each module's
// `index.ts` to read its in-code `meta` (the Zod `configSchema` stays the single
// source of truth) and writes the serialisable static contract that `discover()`
// consumes at runtime WITHOUT importing module code. Run via `bun run modules:manifest`.

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const ROOT = path.resolve(fileURLToPath(new URL("../", import.meta.url)));

/** Roots to scan. Extra dirs (e.g. addon checkouts) may be passed as argv. */
const ROOTS = [
  path.join(ROOT, "packages/core/src/modules"),
  path.join(ROOT, "packages/core/src/lib/modules"),
  ...process.argv.slice(2).map((p) => path.resolve(p)),
];

async function findIndex(dir: string): Promise<string | null> {
  for (const c of ["index.ts", "index.js", "index.mts"]) {
    const p = path.join(dir, c);
    if (
      await fs
        .access(p)
        .then(() => true)
        .catch(() => false)
    )
      return p;
  }
  return null;
}

function extractMeta(mod: Record<string, unknown>): ModuleMeta | ModuleOptions | null {
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

async function walk(dir: string, out: { dir: string; index: string }[]) {
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
    const exists = await fs
      .access(root)
      .then(() => true)
      .catch(() => false);
    if (exists) await walk(root, targets);
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

    const manifest: ModuleManifest = await manifestFromMeta(meta, dir);
    await writeManifest(dir, manifest);
    written++;
    console.log(`${DIM}[manifest]${RESET} ${GREEN}${meta.name}${RESET} → ${DIM}${path.relative(ROOT, dir)}/manifest.json${RESET}`);
  }
  console.log(`${GREEN}[manifest] wrote ${written} manifest(s).${RESET}`);
}

main().catch((err) => {
  console.error(`${RED}❌ Manifest generation failed:${RESET}`, err);
  process.exit(1);
});

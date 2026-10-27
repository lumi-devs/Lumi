import { readFile, readdir, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { validateManifest } from "@lumi/module-runtime";
import type { ModuleManifest } from "@lumi/module-runtime";
import type { ValidationResult } from "./types.js";

const RuntimePackages = new Set([
  "discord.js",
  "@discordjs/builders",
  "@discordjs/formatters",
  "zod",
  "@lumi/module-kit",
  "@lumi/ui",
  "@lumi/foundation",
]);

const ForbiddenPackages = new Set([
  "@lumi/db",
  "@lumi/cache",
  "@lumi/redis",
  "@lumi/module-runtime",
  "@lumi/downloader",
  "@lumi/permits",
  "@lumi/observability",
  "@lumi/scheduler",
  "@lumi/admin",
  "@lumi/core",
]);

const IgnoredDirs = new Set(["node_modules", ".git", "dist", "build"]);
const RequirementRe = /^[a-zA-Z0-9_.@/][a-zA-Z0-9_.@/\-^~>=<*]*$/;

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IgnoredDirs.has(entry.name)) continue;
      files.push(...(await walk(full)));
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

function packageName(spec: string): string {
  const versionAt = spec.indexOf("@", spec.startsWith("@") ? 1 : 0);
  const bare = versionAt === -1 ? spec : spec.slice(0, versionAt);
  const segments = bare.split("/");
  return bare.startsWith("@") ? segments.slice(0, 2).join("/") : (segments[0] ?? bare);
}

function checkImport(
  spec: string,
  file: string,
  root: string,
  requirements: string[],
  errors: string[],
): void {
  const rel = relative(root, file);

  if (spec.startsWith(".")) {
    const target = resolve(dirname(file), spec);
    if (target !== root && !target.startsWith(root + sep)) {
      errors.push(`${rel}: import "${spec}" escapes the addon directory.`);
    }
    return;
  }

  if (spec.startsWith("node:") || spec === "bun" || spec.startsWith("bun:")) return;

  const pkg = packageName(spec);
  if (ForbiddenPackages.has(pkg)) {
    errors.push(`${rel}: "${pkg}" is internal and cannot be imported by add-ons.`);
    return;
  }
  if (RuntimePackages.has(pkg)) return;
  if (requirements.some((requirement) => packageName(requirement) === pkg)) return;

  errors.push(
    `${rel}: "${pkg}" is not a host runtime package and is not listed in manifest requirements.`,
  );
}

export async function validateAddon(dir: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const root = resolve(dir);
  const manifestPath = join(root, "manifest.json");

  let manifest: ModuleManifest;
  try {
    manifest = validateManifest(JSON.parse(await readFile(manifestPath, "utf-8")));
  } catch (error) {
    return {
      errors: [`manifest.json: ${error instanceof Error ? error.message : String(error)}`],
      warnings,
    };
  }

  if (manifest.name !== basename(root)) {
    errors.push(`manifest name "${manifest.name}" must match the directory name.`);
  }

  const entryPath = join(root, manifest.entry);
  if (!(await exists(entryPath))) {
    errors.push(`entry "${manifest.entry}" does not exist.`);
  }

  for (const requirement of manifest.requirements) {
    if (!RequirementRe.test(requirement)) {
      errors.push(`requirement "${requirement}" is not a registry package spec.`);
    }
  }

  for (const blocked of ["node_modules", ".npmrc", "bunfig.toml"]) {
    if (await exists(join(root, blocked))) {
      errors.push(`${blocked} may not be vendored; declare dependencies in manifest requirements.`);
    }
  }

  const transpiler = new Bun.Transpiler({ loader: "ts" });
  for (const file of await walk(root)) {
    const source = await readFile(file, "utf-8");
    for (const imported of transpiler.scanImports(source)) {
      checkImport(imported.path, file, root, manifest.requirements, errors);
    }
  }

  return { errors, warnings };
}

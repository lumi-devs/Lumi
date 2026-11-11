import { lstat, readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import type { ModuleManifest } from "@lumi/module-runtime";
import { validateManifest } from "@lumi/module-runtime";
import { pathExists } from "./fs.js";

export const RequirementRe =
  /^(?:@[a-zA-Z0-9][a-zA-Z0-9._-]*\/)?[a-zA-Z0-9][a-zA-Z0-9._-]*(?:@[0-9A-Za-z.*+^~<>=|_ -]+)?$/;

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

const StaticCallArgument =
  /^\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\$]|\\.)*`)\s*[,)]/;
const UnscannableDynamicImportRe = /(?:^|[^.\w])import\s*\(\s*/g;
const UnscannableRequireRe = /(?:^|[^.\w])require\s*\(\s*/g;
const MetaRequireRe = /import\s*\.\s*meta\s*\.\s*require\s*\(/;

function isScriptFile(name: string): boolean {
  return /\.(?:[cm]?[jt]sx?)$/i.test(name);
}

function hasUnscannableCall(source: string, pattern: RegExp): boolean {
  for (const match of source.matchAll(pattern)) {
    const index = (match.index ?? 0) + match[0].length;
    if (!StaticCallArgument.test(source.slice(index))) return true;
  }
  return false;
}

async function walk(
  dir: string,
  root: string,
  errors: string[],
): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = relative(root, full);
    const info = await lstat(full).catch(() => null);
    if (!info) {
      errors.push(`${rel}: could not be inspected.`);
      continue;
    }

    if (info.isSymbolicLink()) {
      errors.push(`${rel}: symbolic links are not allowed in add-ons.`);
      continue;
    }

    if (info.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      files.push(...(await walk(full, root, errors)));
      continue;
    }

    if (!info.isFile()) {
      errors.push(`${rel}: unsupported file type in add-ons.`);
      continue;
    }
    if (info.nlink > 1) {
      errors.push(`${rel}: hard links are not allowed in add-ons.`);
    }
    if (isScriptFile(entry.name)) files.push(full);
  }
  return files;
}

function packageName(spec: string): string {
  const versionAt = spec.indexOf("@", spec.startsWith("@") ? 1 : 0);
  const bare = versionAt === -1 ? spec : spec.slice(0, versionAt);
  const segments = bare.split("/");
  return bare.startsWith("@")
    ? segments.slice(0, 2).join("/")
    : (segments[0] ?? bare);
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

  if (spec.startsWith("node:") || spec === "bun" || spec.startsWith("bun:"))
    return;

  const pkg = packageName(spec);
  if (ForbiddenPackages.has(pkg)) {
    errors.push(
      `${rel}: "${pkg}" is internal and cannot be imported by add-ons.`,
    );
    return;
  }
  if (RuntimePackages.has(pkg)) return;
  if (requirements.some((requirement) => packageName(requirement) === pkg))
    return;

  errors.push(
    `${rel}: "${pkg}" is not a host runtime package and is not listed in manifest requirements.`,
  );
}

function checkUnscannableImports(
  source: string,
  file: string,
  root: string,
  errors: string[],
): void {
  const rel = relative(root, file);
  if (MetaRequireRe.test(source)) {
    errors.push(`${rel}: import.meta.require is not allowed in add-ons.`);
  }
  if (hasUnscannableCall(source, UnscannableDynamicImportRe)) {
    errors.push(
      `${rel}: dynamic import() with a computed specifier cannot be validated.`,
    );
  }
  if (hasUnscannableCall(source, UnscannableRequireRe)) {
    errors.push(
      `${rel}: require() with a computed specifier cannot be validated.`,
    );
  }
}

export interface ValidateAddonOptions {
  readonly expectedName?: string;
}

export async function validateAddon(
  dir: string,
  options: ValidateAddonOptions = {},
): Promise<string[]> {
  const errors: string[] = [];
  const root = resolve(dir);
  const rootInfo = await lstat(root).catch(() => null);
  if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink()) {
    return ["add-on root must be a real directory, not a symbolic link."];
  }
  const manifestPath = join(root, "manifest.json");

  let manifest: ModuleManifest;
  try {
    manifest = validateManifest(
      JSON.parse(await readFile(manifestPath, "utf-8")),
    );
  } catch (error) {
    return [
      `manifest.json: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }

  if (options.expectedName) {
    if (manifest.name !== options.expectedName) {
      errors.push(
        `manifest name "${manifest.name}" must match the installed module name "${options.expectedName}".`,
      );
    }
  } else if (manifest.name !== basename(root)) {
    errors.push(
      `manifest name "${manifest.name}" must match the directory name.`,
    );
  }

  const entryFile = resolve(root, manifest.entry);
  const entryInfo = await lstat(entryFile).catch(() => null);
  if (!entryFile.startsWith(root + sep)) {
    errors.push(`entry "${manifest.entry}" escapes the addon directory.`);
  } else if (!isScriptFile(entryFile)) {
    errors.push(
      `entry "${manifest.entry}" must be a JavaScript or TypeScript file.`,
    );
  } else if (!entryInfo?.isFile() || entryInfo.isSymbolicLink()) {
    errors.push(
      `entry "${manifest.entry}" does not exist or is not a regular file.`,
    );
  }

  for (const requirement of manifest.requirements) {
    if (!RequirementRe.test(requirement)) {
      errors.push(
        `requirement "${requirement}" is not a registry package spec.`,
      );
    }
  }

  for (const blocked of ["node_modules", ".npmrc", "bunfig.toml"]) {
    if (await pathExists(join(root, blocked))) {
      errors.push(
        `${blocked} may not be vendored; declare dependencies in manifest requirements.`,
      );
    }
  }

  const files = await walk(root, root, errors);
  const transpiler = new Bun.Transpiler({ loader: "ts" });
  const sources = await Promise.all(
    files.map(async (file) => ({
      file,
      source: await readFile(file, "utf-8"),
    })),
  );
  for (const { file, source } of sources) {
    checkUnscannableImports(source, file, root, errors);
    for (const imported of transpiler.scanImports(source)) {
      checkImport(imported.path, file, root, manifest.requirements, errors);
    }
  }

  return errors;
}

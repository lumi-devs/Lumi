import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseManifest } from "@lumi/module-runtime";
import { packageJsonDependencyErrors, parseRequirements } from "./requirements.ts";
import { AddonRuntimePackages } from "./runtime.ts";

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const ForbiddenBare = new Set([
  "@lumi/db",
  "@lumi/cache",
  "@lumi/redis",
  "@lumi/module-runtime",
  "@lumi/downloader",
]);

const ForbiddenSource = [
  { pattern: /new\s+Client\s*\(/, message: "creates a Discord client; use the services argument instead" },
  { pattern: /new\s+EmbedBuilder\s*\(/, message: "uses EmbedBuilder; use the @lumi/ui card builders" },
  { pattern: /\bprocess\.env\b/, message: "reads process.env directly; configuration belongs in the manifest/config schema" },
];

const ScriptExtensions = new Set([".ts", ".mts", ".tsx", ".js", ".mjs", ".cjs", ".jsx"]);
const IgnoredDirs = new Set(["node_modules", ".git", ".versions"]);

function loaderFor(file: string): "ts" | "tsx" | "js" | "jsx" {
  switch (path.extname(file)) {
    case ".ts":
    case ".mts":
      return "ts";
    case ".tsx":
      return "tsx";
    case ".jsx":
      return "jsx";
    default:
      return "js";
  }
}

function inside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function packageName(specifier: string): string {
  if (!specifier.startsWith("@")) return specifier.split("/")[0]!;
  const [scope, name] = specifier.split("/");
  return name ? `${scope}/${name}` : specifier;
}

async function walk(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (IgnoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
      continue;
    }
    if (!entry.isFile() || !ScriptExtensions.has(path.extname(entry.name))) continue;
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".spec.ts")) continue;
    files.push(full);
  }
  return files;
}

export async function validateAddon(dir: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const root = path.resolve(dir);
  const name = path.basename(root);

  const raw = await readFile(path.join(root, "manifest.json"), "utf8").catch(() => null);
  if (raw === null) return { errors: ["missing manifest.json"], warnings };

  let manifest: ReturnType<typeof parseManifest>;
  try {
    manifest = parseManifest(JSON.parse(raw));
  } catch (error) {
    return { errors: [`manifest.json: ${error instanceof Error ? error.message : String(error)}`], warnings };
  }

  if (manifest.name !== name) {
    errors.push(`manifest name '${manifest.name}' does not match directory '${name}'`);
  }

  for (const forbidden of ["bunfig.toml", ".npmrc"]) {
    if (await stat(path.join(root, forbidden)).then(() => true).catch(() => false)) {
      errors.push(`${forbidden} is not allowed in an addon`);
    }
  }
  if (await stat(path.join(root, "node_modules")).then(() => true).catch(() => false)) {
    errors.push("node_modules is not allowed; declare npm packages in manifest requirements");
  }

  const requirements = parseRequirements(manifest.requirements);
  errors.push(...requirements.errors);
  errors.push(...(await packageJsonDependencyErrors(root)));
  const declared = requirements.declared;

  const entry = path.resolve(root, manifest.entry);
  if (!inside(root, entry)) errors.push(`entry '${manifest.entry}' escapes the addon directory`);
  else {
    const entryInfo = await stat(entry).catch(() => null);
    if (!entryInfo?.isFile()) errors.push(`entry '${manifest.entry}' does not exist`);
  }

  const files = await walk(root);

  for (const file of files) {
    const relative = path.relative(root, file);
    const source = await readFile(file, "utf8").catch(() => null);
    if (source === null) continue;

    for (const check of ForbiddenSource) {
      if (check.pattern.test(source)) warnings.push(`${relative}: ${check.message}`);
    }

    let imports: Array<{ path: string }>;
    try {
      imports = new Bun.Transpiler({ loader: loaderFor(file) }).scanImports(source);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      errors.push(`${relative}: could not scan imports: ${reason}`);
      continue;
    }
    for (const imported of imports) {
      const specifier = imported.path;
      if (specifier.startsWith(".")) {
        const resolved = path.resolve(path.dirname(file), specifier);
        if (!inside(root, resolved)) {
          errors.push(`${relative}: relative import '${specifier}' escapes the addon directory`);
        }
        continue;
      }
      if (specifier.startsWith("@lumi/")) {
        const pkg = packageName(specifier);
        if (ForbiddenBare.has(pkg)) {
          errors.push(`${relative}: imports bot internals '${specifier}'`);
        } else if (!AddonRuntimePackages.has(pkg)) {
          errors.push(`${relative}: unknown @lumi package '${specifier}'`);
        }
        continue;
      }
      if (specifier.startsWith("node:") || specifier === "bun" || specifier.startsWith("bun:")) {
        errors.push(`${relative}: imports '${specifier}'; addons receive services instead of runtime internals`);
        continue;
      }
      const pkg = packageName(specifier);
      if (!AddonRuntimePackages.has(pkg) && !declared.has(pkg)) {
        errors.push(`${relative}: imports '${specifier}' without declaring '${pkg}' in manifest requirements`);
      }
    }
  }

  return { errors, warnings };
}

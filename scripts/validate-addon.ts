import fs from "node:fs";
import path from "node:path";

const ALLOWED_PACKAGES = [
  "@lumi/module-kit",
  "@lumi/foundation",
  "@lumi/ui",
];

function isAllowedImport(specifier: string): boolean {
  if (specifier.startsWith("node:") || specifier.startsWith("bun:") || specifier === "bun") {
    return true;
  }
  if (
    specifier === "discord.js" ||
    specifier.startsWith("@discordjs/") ||
    specifier === "zod"
  ) {
    return true;
  }
  return ALLOWED_PACKAGES.some(
    (pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`),
  );
}

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "tests" || entry.name.startsWith(".")) continue;
      out.push(...listTsFiles(full));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js"))) {
      out.push(full);
    }
  }
  return out;
}

export function validateSingleAddon(addonDir: string): string[] {
  const errors: string[] = [];
  const manifestPath = path.join(addonDir, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    return ["Missing manifest.json"];
  }

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
  } catch (error) {
    return [`manifest.json is not valid JSON: ${(error as Error).message}`];
  }

  for (const field of [
    "apiVersion",
    "name",
    "displayName",
    "version",
    "entry",
    "endUserDataStatement",
  ]) {
    if (!(field in manifest)) errors.push(`manifest.json missing required field "${field}"`);
  }

  if (manifest.apiVersion !== 2) {
    errors.push(`manifest.apiVersion must be 2 (received ${String(manifest.apiVersion)})`);
  }

  const expectedName = path.basename(addonDir);
  if (manifest.name !== expectedName) {
    errors.push(`manifest.name "${String(manifest.name)}" must match folder name "${expectedName}"`);
  }

  const entry = String(manifest.entry || "index.ts");
  const entryPath = path.join(addonDir, entry);
  if (!fs.existsSync(entryPath)) {
    errors.push(`Entry file "${entry}" does not exist in "${addonDir}"`);
  } else {
    const src = fs.readFileSync(entryPath, "utf-8");
    if (!/\bexport\s+default\b/.test(src)) {
      errors.push(`Entry file "${entry}" must default-export the module via defineModule(...)`);
    }
  }

  if (!fs.existsSync(path.join(addonDir, "README.md"))) {
    errors.push("Missing README.md documentation");
  }

  const files = listTsFiles(addonDir);
  for (const file of files) {
    const source = fs.readFileSync(file, "utf-8");
    const specifiers = [
      ...source.matchAll(
        /(?:import|export)\s+(?:type\s+)?(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']/g,
      ),
    ]
      .map((m) => m[1])
      .filter((v): v is string => typeof v === "string");

    for (const specifier of specifiers) {
      if (specifier.startsWith(".")) {
        if (!specifier.endsWith(".js") && !specifier.endsWith(".json")) {
          errors.push(
            `${path.relative(addonDir, file)}: relative import "${specifier}" must end with extension (e.g. .js)`,
          );
        }
        const resolved = path.resolve(path.dirname(file), specifier);
        if (!resolved.startsWith(path.resolve(addonDir) + path.sep)) {
          errors.push(
            `${path.relative(addonDir, file)}: import "${specifier}" escapes the add-on directory boundary`,
          );
        }
        continue;
      }

      if (!isAllowedImport(specifier)) {
        errors.push(
          `${path.relative(addonDir, file)}: Forbidden import "${specifier}". Add-ons may only import @lumi/module-kit, @lumi/foundation, @lumi/ui, discord.js, zod, or packages declared in manifest.requirements.`,
        );
      }
    }
  }

  return errors;
}

function main(): void {
  const target = process.argv[2];
  if (!target || target === "-h" || target === "--help") {
    console.log(`
Lumi Add-on Linter & Static Validator

Usage:
  bun run addon:validate <path-to-addon>
  bun run addon:validate --all

Examples:
  bun run addon:validate data/addons/my-addon
  bun run addon:validate ../lumi-addons/confessions
`);
    process.exit(target ? 0 : 1);
  }

  let pathsToValidate: string[] = [];

  if (target === "--all") {
    const addonsDir = path.resolve("data/addons");
    if (!fs.existsSync(addonsDir)) {
      console.log("No addons installed in data/addons.");
      process.exit(0);
    }
    pathsToValidate = fs
      .readdirSync(addonsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() || d.isSymbolicLink())
      .map((d) => path.join(addonsDir, d.name));
  } else {
    pathsToValidate = [path.resolve(target)];
  }

  let failed = 0;
  for (const dir of pathsToValidate) {
    const name = path.basename(dir);
    const errors = validateSingleAddon(dir);
    if (errors.length === 0) {
      console.log(`✅  [PASS] ${name}`);
    } else {
      failed++;
      console.error(`❌  [FAIL] ${name}:`);
      for (const err of errors) {
        console.error(`    • ${err}`);
      }
    }
  }

  console.log(`\nValidation complete: ${pathsToValidate.length - failed}/${pathsToValidate.length} passed.`);
  if (failed > 0) process.exit(1);
}

if (import.meta.main) {
  main();
}

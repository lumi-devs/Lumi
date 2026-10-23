import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Logger } from "@lumi/foundation";
import { AddonRuntimePackages } from "./runtime.ts";

const PackageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const RegistrySpec =
  /^(?:latest|\*|(?:\^|~|>=|<=|>|<|=)?\s*v?\d+(?:\.(?:\d+|x|\*)){0,2}(?:-[0-9A-Za-z.-]+)?(?:\s*\|\|\s*(?:\^|~|>=|<=|>|<|=)?\s*v?\d+(?:\.(?:\d+|x|\*)){0,2}(?:-[0-9A-Za-z.-]+)?)*)$/i;

const LockFiles = ["bun.lock", "bun.lockb"];
const DependencySections = ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"];

export interface AddonRequirements {
  readonly declared: ReadonlyMap<string, string>;
  readonly install: ReadonlyMap<string, string>;
  readonly errors: string[];
}

function parseRequirement(raw: string): { name: string; spec: string } | string {
  const value = raw.trim();
  if (!value) return "empty requirement";

  let name: string;
  let spec: string;
  if (value.startsWith("@")) {
    const slash = value.indexOf("/");
    const at = value.indexOf("@", slash + 1);
    name = at === -1 ? value : value.slice(0, at);
    spec = at === -1 ? "*" : value.slice(at + 1);
  } else {
    const at = value.indexOf("@");
    name = at === -1 ? value : value.slice(0, at);
    spec = at === -1 ? "*" : value.slice(at + 1);
  }

  if (!PackageName.test(name)) return `invalid package name '${name}'`;
  if (!RegistrySpec.test(spec)) return `'${name}' must use a registry semver range`;
  return { name, spec };
}

export function parseRequirements(requirements: readonly string[]): AddonRequirements {
  const declared = new Map<string, string>();
  const install = new Map<string, string>();
  const errors: string[] = [];

  for (const raw of requirements) {
    const parsed = parseRequirement(raw);
    if (typeof parsed === "string") {
      errors.push(`requirements: ${parsed}`);
      continue;
    }
    const { name, spec } = parsed;
    const existing = declared.get(name);
    if (existing !== undefined) {
      if (existing !== spec) errors.push(`requirements: conflicting versions for '${name}'`);
      continue;
    }
    if (name.startsWith("@lumi/") && !AddonRuntimePackages.has(name)) {
      errors.push(`requirements: '${name}' is a bot internal and is not available to addons`);
      continue;
    }
    declared.set(name, spec);
    if (!AddonRuntimePackages.has(name)) install.set(name, spec);
  }

  return { declared, install, errors };
}

export async function packageJsonDependencyErrors(dir: string): Promise<string[]> {
  const raw = await readFile(path.join(dir, "package.json"), "utf8").catch(() => null);
  if (raw === null) return [];
  let pkg: unknown;
  try {
    pkg = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof pkg !== "object" || pkg === null || Array.isArray(pkg)) return [];
  const record = pkg as Record<string, unknown>;
  return DependencySections.filter((section) => record[section] !== undefined).map(
    (section) => `package.json: remove ${section}; npm dependencies belong in manifest.json requirements`,
  );
}

export async function installAddonRequirements(
  dir: string,
  requirements: readonly string[],
  logger: Logger,
): Promise<void> {
  const parsed = parseRequirements(requirements);
  if (parsed.errors.length > 0) {
    throw new Error(`Invalid addon requirements:\n${parsed.errors.map((error) => `• ${error}`).join("\n")}`);
  }
  if (parsed.install.size === 0) return;

  const packagePath = path.join(dir, "package.json");
  const originalPackage = await readFile(packagePath, "utf8").catch(() => null);
  await rm(path.join(dir, "node_modules"), { recursive: true, force: true });
  await Promise.all(LockFiles.map((name) => rm(path.join(dir, name), { force: true })));

  await writeFile(
    packagePath,
    JSON.stringify(
      {
        private: true,
        dependencies: Object.fromEntries(parsed.install),
      },
      null,
      2,
    ),
  );

  try {
    const proc = Bun.spawn([process.execPath, "install", "--production", "--ignore-scripts", "--no-save"], {
      cwd: dir,
      stdout: "ignore",
      stderr: "pipe",
    });
    const timer = setTimeout(() => proc.kill(), 300_000);
    try {
      const stderr = await new Response(proc.stderr).text();
      const code = await proc.exited;
      if (code !== 0) {
        throw new Error(`bun install failed (${code}):\n${stderr.trim().slice(0, 2_000)}`);
      }
    } finally {
      clearTimeout(timer);
    }
    logger.info({ requirements: parsed.install.size }, "addon requirements installed");
  } finally {
    if (originalPackage === null) await rm(packagePath, { force: true });
    else await writeFile(packagePath, originalPackage);
  }
}

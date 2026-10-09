import path from "node:path";
import { getDevModulePaths } from "@lumi/core/env";
import { readManifest } from "@lumi/core/manifest";
import { DefaultModuleRoot, walk } from "@lumi/core/generate-manifests";

export const help = `Usage: lumi module list

Lists every bundled module (packages/core/src/modules/*, plus any extra
LUMI_DEV_PATHS roots), reading each module's manifest.json - the same
directory walk \`bun run modules:manifest\` uses to discover module
directories, without importing module code.

Prints: name, version, description.
`;

async function listModules(): Promise<number> {
  const roots = [DefaultModuleRoot, ...getDevModulePaths().map((p) => path.resolve(p))];
  const found: { dir: string; index: string }[] = [];
  for (const root of roots) {
    await walk(root, found);
  }

  const rows: { name: string; version: string; description: string }[] = [];
  for (const { dir } of found) {
    const manifest = await readManifest(dir);
    if (!manifest) continue;
    rows.push({
      name: manifest.name,
      version: manifest.version,
      description: manifest.description || manifest.short || "",
    });
  }

  if (rows.length === 0) {
    console.log("No modules found (no manifest.json present - run `bun run modules:manifest`?).");
    return 0;
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  const nameWidth = Math.max(4, ...rows.map((r) => r.name.length));
  const versionWidth = Math.max(7, ...rows.map((r) => r.version.length));
  console.log(`${"NAME".padEnd(nameWidth)}  ${"VERSION".padEnd(versionWidth)}  DESCRIPTION`);
  for (const row of rows) {
    console.log(`${row.name.padEnd(nameWidth)}  ${row.version.padEnd(versionWidth)}  ${row.description}`);
  }
  return 0;
}

export async function run(argv: string[]): Promise<number> {
  const sub = argv[0] ?? "list";
  if (sub === "--help" || sub === "-h") {
    console.log(help);
    return 0;
  }
  if (sub !== "list") {
    console.error(`Unknown module subcommand "${sub}". Expected "list".`);
    return 2;
  }
  return listModules();
}

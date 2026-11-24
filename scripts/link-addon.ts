import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function printUsage(): void {
  console.log(`
Lumi Add-on Linker (Redbot-style addpath / local cog linking)

Usage:
  bun run addon:link <path-to-addon>
  bun run addon:unlink <addon-name>

Examples:
  bun run addon:link ../lumi-addons/confessions
  bun run addon:link /path/to/my-custom-addon
  bun run addon:unlink confessions
`);
}

function linkAddon(targetInput: string): void {
  const resolved = path.resolve(targetInput);
  if (!fs.existsSync(resolved)) {
    console.error(`Error: Path "${resolved}" does not exist.`);
    process.exit(1);
  }

  const manifestPath = path.join(resolved, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`Error: No manifest.json found at "${manifestPath}".`);
    process.exit(1);
  }

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
  } catch (error) {
    console.error(`Error parsing manifest.json:`, error);
    process.exit(1);
  }

  const name = String(manifest.name || path.basename(resolved));
  const addonsDir = path.resolve("data/addons");
  fs.mkdirSync(addonsDir, { recursive: true });

  const destLink = path.join(addonsDir, name);
  if (fs.existsSync(destLink)) {
    const stat = fs.lstatSync(destLink);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(destLink);
    } else {
      console.error(`Error: "${destLink}" already exists and is a regular file/directory.`);
      process.exit(1);
    }
  }

  fs.symlinkSync(resolved, destLink, "dir");
  console.log(`✅ Successfully linked add-on "${name}":`);
  console.log(`   data/addons/${name} -> ${resolved}`);

  if (Array.isArray(manifest.requirements) && manifest.requirements.length > 0) {
    const reqs = manifest.requirements as string[];
    console.log(`\n📦 Installing manifest requirements: ${reqs.join(", ")}`);
    try {
      execSync(
        `bun add --production --ignore-scripts --no-save ${reqs.join(" ")}`,
        { stdio: "inherit", cwd: resolved },
      );
    } catch (err) {
      console.warn("Warning: Could not automatically install requirements:", err);
    }
  }

  console.log(`\n💡 To run or test this add-on:`);
  console.log(`   - If Lumi is running: /owner reload module:${name}`);
  console.log(`   - If Lumi is offline: bun run dev:bot\n`);
}

function unlinkAddon(name: string): void {
  const target = path.resolve("data/addons", name);
  if (!fs.existsSync(target)) {
    console.log(`Add-on "${name}" is not currently linked in data/addons.`);
    return;
  }

  const stat = fs.lstatSync(target);
  if (!stat.isSymbolicLink()) {
    console.error(`Error: "${target}" is not a symbolic link. Remove it manually to prevent accidental data loss.`);
    process.exit(1);
  }

  fs.unlinkSync(target);
  console.log(`🗑️  Successfully unlinked add-on "${name}" from data/addons/${name}.`);
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  if (args[0] === "unlink" && args[1]) {
    unlinkAddon(args[1]);
  } else if (process.argv[1]?.includes("unlink") || args[0]?.startsWith("--unlink=")) {
    unlinkAddon(args[0]?.replace("--unlink=", "") || args[1]!);
  } else {
    linkAddon(args[0]!);
  }
}

main();

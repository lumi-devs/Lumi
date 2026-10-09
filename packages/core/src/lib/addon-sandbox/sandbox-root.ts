import path from "node:path";
import { lstat, mkdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ModuleRoot } from "#lib/downloader/resolver.js";

const SdkDir = fileURLToPath(new URL("./sdk/", import.meta.url));

const Subpaths: Record<string, string> = {
  ".": "index.ts",
  "./commands": "commands.ts",
  "./config": "config.ts",
  "./discord": "discord.ts",
  "./events": "events.ts",
  "./interactions": "interactions.ts",
  "./kv": "kv.ts",
  "./permissions": "permissions.ts",
  "./valkey": "valkey.ts",
  "./scheduling": "scheduling.ts",
  "./ui": "ui.ts",
  "./utils": "utils.ts",
};

const ShimDir = ".lumi-sdk";

function shimFile(subpath: string): string {
  return `${subpath === "." ? "index" : subpath.slice(2)}.ts`;
}

// Nearest package.json to addon files. Named "lumi" for self-resolution; no
// `imports` map so `#lib/*` stays unreachable from addon code.
export async function ensureSandboxRoot(): Promise<void> {
  await mkdir(path.join(ModuleRoot, ShimDir), { recursive: true });
  const writes: Promise<unknown>[] = [];
  const exports: Record<string, string> = {};

  for (const [subpath, file] of Object.entries(Subpaths)) {
    const shim = shimFile(subpath);
    exports[subpath] = `./${ShimDir}/${shim}`;
    writes.push(
      writeFile(
        path.join(ModuleRoot, ShimDir, shim),
        `export * from ${JSON.stringify(path.join(SdkDir, file))};\n`,
      ),
    );
  }

  writes.push(
    writeFile(
      path.join(ModuleRoot, "package.json"),
      `${JSON.stringify({ name: "lumi", private: true, type: "module", exports }, null, 2)}\n`,
    ),
  );

  writes.push(
    writeFile(
      path.join(ModuleRoot, "tsconfig.json"),
      `${JSON.stringify({ compilerOptions: { paths: {} } }, null, 2)}\n`,
    ),
  );

  await Promise.all(writes);
}

// `node_modules/lumi` inside the addon beats any ancestor package.json (e.g. a repo
// root's) that would otherwise shadow the sandbox root's self-referencing `lumi` package.
export async function ensureAddonLumiLink(addonDir: string): Promise<void> {
  const nmDir = path.join(addonDir, "node_modules");
  await mkdir(nmDir, { recursive: true });
  const link = path.join(nmDir, "lumi");
  const current = await readlink(link).catch(() => null);
  if (current && path.resolve(nmDir, current) === ModuleRoot) return;
  const stat = await lstat(link).catch(() => null);
  if (stat && !stat.isSymbolicLink()) return;
  await rm(link, { recursive: true, force: true }).catch(() => undefined);
  await symlink(ModuleRoot, link, "dir");
}

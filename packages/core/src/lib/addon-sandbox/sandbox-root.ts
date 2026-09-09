import path from "node:path";
import { fileURLToPath } from "node:url";
import { ModuleRoot } from "#lib/downloader/resolver.js";

const SdkDir = fileURLToPath(new URL("./sdk/", import.meta.url));

const Subpaths: Record<string, string> = {
  ".": "index.ts",
  "./commands": "commands.ts",
  "./config": "config.ts",
  "./discord": "discord.ts",
  "./interactions": "interactions.ts",
  "./kv": "kv.ts",
  "./permissions": "permissions.ts",
  "./redis": "redis.ts",
  "./scheduling": "scheduling.ts",
  "./ui": "ui.ts",
  "./utils": "utils.ts",
};

const ShimDir = ".lumi-sdk";

function shimFile(subpath: string): string {
  return `${subpath === "." ? "index" : subpath.slice(2)}.ts`;
}

// The nearest package.json to every addon file. Named "lumi" so `import "lumi"`
// self-resolves here rather than at the repo root, and carries no `imports` map
// so `#lib/*` and `#database/*` do not resolve from addon code. Targets point at
// generated shims because an exports target may not escape its own package.
export async function ensureSandboxRoot(): Promise<void> {
  const writes: Promise<unknown>[] = [];
  const exports: Record<string, string> = {};

  for (const [subpath, file] of Object.entries(Subpaths)) {
    const shim = shimFile(subpath);
    exports[subpath] = `./${ShimDir}/${shim}`;
    writes.push(
      Bun.write(
        path.join(ModuleRoot, ShimDir, shim),
        `export * from ${JSON.stringify(path.join(SdkDir, file))};\n`,
      ),
    );
  }

  writes.push(
    Bun.write(
      path.join(ModuleRoot, "package.json"),
      `${JSON.stringify({ name: "lumi", private: true, type: "module", exports }, null, 2)}\n`,
    ),
  );

  await Promise.all(writes);
}

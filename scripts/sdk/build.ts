import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateDtsBundle } from "dts-bundle-generator";

const DIRNAME = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIRNAME, "../..");
const SDK_DIR = path.join(ROOT, "packages/core/src/lib/addon-sandbox/sdk");
const OUT_DIR = path.join(ROOT, "dist/sdk");
const TSCONFIG = path.join(DIRNAME, "tsconfig.json");

// Mirrors the root package.json "exports" map's subpaths (the ones addon
// authors actually import). "builder" and "rpc" are internal to the sandbox
// runtime and aren't part of that surface, so they're not published here.
const ENTRYPOINTS = [
  "index",
  "commands",
  "config",
  "discord",
  "events",
  "interactions",
  "kv",
  "permissions",
  "valkey",
  "scheduling",
  "ui",
  "utils",
] as const;

// Packages that must remain external imports in the generated .d.ts files rather
// than being inlined. Inlining discord.js causes catastrophic circular AST traversals
// (e.g. Message -> Guild -> Channel -> Message), hanging dts-bundle-generator indefinitely.
const IMPORTED_LIBRARIES = [
  "discord.js",
  "@discordjs/builders",
  "@discordjs/formatters",
  "@discordjs/rest",
  "discord-api-types",
  "@lumi/contracts",
  "@lumi-devs/contracts",
  "zod",
];

// Anything matching these in an emitted .d.ts means a type the SDK exposes
// wasn't inlined and leaked an unresolvable internal specifier instead -
// a third-party addon repo has no way to resolve "#lib/*" or "@lumi/core".
const FORBIDDEN_SPECIFIERS = [/#lib\//, /#modules\//, /@lumi\/core\b/, /@lumi\/observability\b/];

async function main(): Promise<void> {
  const startTime = Date.now();
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const entries = ENTRYPOINTS.map((name) => ({
    filePath: path.join(SDK_DIR, `${name}.ts`),
    libraries: {
      importedLibraries: IMPORTED_LIBRARIES,
    },
    output: { noBanner: true },
  }));

  const outputs = generateDtsBundle(entries, { preferredConfigPath: TSCONFIG });
  const violations: string[] = [];

  for (const [i, name] of ENTRYPOINTS.entries()) {
    const generated = outputs[i];
    if (generated === undefined) {
      throw new Error(`dts-bundle-generator produced no output for "${name}"`);
    }

    if (process.env.SDK_BUILD_DEBUG) {
      await writeFile(path.join(OUT_DIR, `${name}.debug.d.ts`), generated);
    }

    // @lumi/contracts is resolved through the workspace while building; the
    // published SDK depends on its published counterpart instead.
    // Also strip any remaining #lib/ or #modules/ JSDoc references that
    // dts-bundle-generator didn't inline (e.g. {@link "#lib/..."}).
    const rewritten = generated
      .replaceAll("@lumi/contracts", "@lumi-devs/contracts")
      .replace(/(\{@link\s+["'])#lib\//g, "$1")
      .replace(/(\{@link\s+["'])#modules\//g, "$1");
    await writeFile(path.join(OUT_DIR, `${name}.d.ts`), rewritten);

    for (const pattern of FORBIDDEN_SPECIFIERS) {
      if (pattern.test(rewritten)) {
        violations.push(`${name}.d.ts matches ${pattern}`);
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(
      "Emitted SDK types still reference an internal specifier a third-party addon repo can't " +
        `resolve - any internal type the SDK exposes must be inlined, not imported:\n${violations.join("\n")}`,
    );
  }

  await writeSdkPackageJson();

  console.log(
    `Built ${ENTRYPOINTS.length} SDK type entrypoints into ${path.relative(ROOT, OUT_DIR)}/ in ${Date.now() - startTime}ms`,
  );
}

async function writeSdkPackageJson(): Promise<void> {
  const contracts = JSON.parse(
    await readFile(path.join(ROOT, "packages/contracts/package.json"), "utf8"),
  ) as { version: string };

  const rootPkg = JSON.parse(
    await readFile(path.join(ROOT, "package.json"), "utf8"),
  ) as { version: string };

  const exportsMap: Record<string, { types: string }> = {};
  for (const name of ENTRYPOINTS) {
    exportsMap[name === "index" ? "." : `./${name}`] = { types: `./${name}.d.ts` };
  }

  const pkg = {
    name: "@lumi-devs/sdk",
    version: rootPkg.version || "0.6.0",
    description:
      "Type declarations for the Lumi addon SDK (the `lumi` package addon code imports at runtime). " +
      "Types only - no runtime code; the host resolves `lumi` itself.",
    license: "AGPL-3.0-only",
    repository: {
      type: "git",
      url: "https://github.com/lumi-devs/Lumi.git",
      directory: "scripts/sdk",
    },
    types: "./index.d.ts",
    exports: exportsMap,
    typesVersions: {
      "*": {
        "*": ["./*.d.ts"],
      },
    },
    peerDependencies: {
      "@lumi-devs/contracts": `^${contracts.version}`,
      "@discordjs/builders": "^1.14.1",
      "discord.js": "^14.27.0",
      "zod": "^4",
    },
    peerDependenciesMeta: {
      "@discordjs/builders": {
        optional: true,
      },
      "discord.js": {
        optional: true,
      },
      "zod": {
        optional: true,
      },
    },
    publishConfig: {
      access: "public",
      registry: "https://registry.npmjs.org/",
    },
  };

  await writeFile(path.join(OUT_DIR, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
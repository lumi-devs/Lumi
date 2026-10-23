import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateAddon } from "../src/index.ts";

const roots: string[] = [];

async function addon(name: string, files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join("/tmp", "lumi-addon-"));
  roots.push(root);
  const dir = path.join(root, name);
  await mkdir(dir, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(dir, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return dir;
}

const manifest = (name: string, entry = "./index.ts", requirements: string[] = []) =>
  JSON.stringify({
    apiVersion: 2,
    name,
    displayName: name,
    emoji: "🧪",
    description: "test addon",
    version: "1.0.0",
    entry,
    dependencies: {},
    requirements,
    conflicts: [],
    capabilities: ["commands"],
  });

afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("addon validation", () => {
  test("accepts a self-contained addon", async () => {
    const dir = await addon("valid", {
      "manifest.json": manifest("valid"),
      "index.ts": [
        'import { defineModule } from "@lumi/module-kit";',
        'import { helper } from "./helper.ts";',
        "export default defineModule({ name: \"valid\", helper });",
      ].join("\n"),
      "helper.ts": "export const helper = true;",
    });

    expect(await validateAddon(dir)).toEqual({ errors: [], warnings: [] });
  });

  test("rejects a relative import that escapes the addon", async () => {
    const dir = await addon("escape", {
      "manifest.json": manifest("escape"),
      "index.ts": 'export { value } from "../outside.ts";',
    });

    const result = await validateAddon(dir);
    expect(result.errors.join("\n")).toContain("escapes the addon directory");
  });

  test("rejects bot internals and node runtime imports", async () => {
    const dir = await addon("internals", {
      "manifest.json": manifest("internals"),
      "index.ts": [
        'import { DatabaseService } from "@lumi/db";',
        'import { readFile } from "node:fs/promises";',
        'import { spawn } from "bun";',
      ].join("\n"),
    });

    const result = await validateAddon(dir);
    expect(result.errors.join("\n")).toContain("@lumi/db");
    expect(result.errors.join("\n")).toContain("node:fs/promises");
    expect(result.errors.join("\n")).toContain("bun");
  });

  test("requires bare imports to be runtime packages or manifest requirements", async () => {
    const files = {
      "manifest.json": manifest("deps"),
      "index.ts": 'import { chunk } from "lodash";',
    };
    const dir = await addon("deps", files);
    expect((await validateAddon(dir)).errors.join("\n")).toContain("without declaring 'lodash'");

    const declared = await addon("deps", {
      ...files,
      "manifest.json": manifest("deps", "./index.ts", ["lodash@^4.0.0"]),
    });
    expect((await validateAddon(declared)).errors).toEqual([]);
  });

  test("rejects requirement specs that are not registry ranges", async () => {
    const dir = await addon("deps", {
      "manifest.json": manifest("deps", "./index.ts", ["lodash@file:../lodash"]),
      "index.ts": "export default {};",
    });
    expect((await validateAddon(dir)).errors.join("\n")).toContain("registry semver range");
  });

  test("rejects bot internals as requirements", async () => {
    const dir = await addon("deps", {
      "manifest.json": manifest("deps", "./index.ts", ["@lumi/db@^1.0.0"]),
      "index.ts": "export default {};",
    });
    expect((await validateAddon(dir)).errors.join("\n")).toContain("bot internal");
  });

  test("rejects package.json dependency declarations", async () => {
    const dir = await addon("deps", {
      "manifest.json": manifest("deps"),
      "index.ts": "export default {};",
      "package.json": JSON.stringify({ dependencies: { lodash: "^4.0.0" } }),
    });
    expect((await validateAddon(dir)).errors.join("\n")).toContain("manifest.json requirements");
  });

  test("rejects registry config files", async () => {
    const dir = await addon("config", {
      "manifest.json": manifest("config"),
      "index.ts": "export default {};",
      "bunfig.toml": '[install]\nregistry = "https://evil.invalid"\n',
    });
    expect((await validateAddon(dir)).errors.join("\n")).toContain("bunfig.toml");
  });

  test("rejects vendored node_modules", async () => {
    const dir = await addon("vendored", {
      "manifest.json": manifest("vendored"),
      "index.ts": "export default {};",
      "node_modules/evil/index.js": "module.exports = 1;",
    });
    expect((await validateAddon(dir)).errors.join("\n")).toContain("node_modules is not allowed");
  });

  test("scans JSX entries in build directories", async () => {
    const dir = await addon("build", {
      "manifest.json": manifest("build", "./dist/index.tsx"),
      "dist/index.tsx": 'import fs from "node:fs";\nexport default <div />;\n',
    });
    const errors = (await validateAddon(dir)).errors.join("\n");
    expect(errors).toContain("node:fs");
    expect(errors).not.toContain("could not scan");
  });

  test("rejects a manifest whose name does not match its directory", async () => {
    const dir = await addon("actual", {
      "manifest.json": manifest("different"),
      "index.ts": "export default {};",
    });
    expect((await validateAddon(dir)).errors.join("\n")).toContain("does not match directory");
  });

  test("rejects a missing entry", async () => {
    const dir = await addon("missing", {
      "manifest.json": manifest("missing", "./nope.ts"),
    });
    expect((await validateAddon(dir)).errors.join("\n")).toContain("does not exist");
  });

  test("reports source-level warnings without failing", async () => {
    const dir = await addon("warned", {
      "manifest.json": manifest("warned"),
      "index.ts": "export const token = process.env.TOKEN;",
    });
    const result = await validateAddon(dir);
    expect(result.errors).toEqual([]);
    expect(result.warnings.join("\n")).toContain("process.env");
  });
});

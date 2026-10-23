import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { discoverModules } from "../src/discovery.ts";

const roots: string[] = [];

async function fixture(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "lumi-modules-"));
  roots.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(roots.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("module discovery", () => {
  test("discovers valid modules and reports broken ones without throwing", async () => {
    const root = await fixture();
    await mkdir(path.join(root, "sample"), { recursive: true });
    await writeFile(path.join(root, "sample", "index.ts"), "export default {};\n");
    await writeFile(
      path.join(root, "sample", "manifest.json"),
      JSON.stringify({
        apiVersion: 2,
        name: "sample",
        displayName: "Sample",
        description: "Sample",
        version: "1.0.0",
        entry: "./index.ts",
      }),
    );

    await mkdir(path.join(root, "broken"), { recursive: true });
    await writeFile(path.join(root, "broken", "manifest.json"), '{"name":"broken"}');

    const result = await discoverModules([{ path: root, origin: "bundled" }]);
    expect(result.modules.map((module) => module.manifest.name)).toEqual(["sample"]);
    expect(result.broken).toHaveLength(1);
    expect(result.broken[0]?.issues.length).toBeGreaterThan(0);
  });

  test("rejects an entry outside the module directory", async () => {
    const root = await fixture();
    await mkdir(path.join(root, "escape"), { recursive: true });
    await writeFile(
      path.join(root, "escape", "manifest.json"),
      JSON.stringify({
        apiVersion: 2,
        name: "escape",
        displayName: "Escape",
        description: "Escape",
        version: "1.0.0",
        entry: "../outside.ts",
      }),
    );

    const result = await discoverModules([{ path: root, origin: "addon" }]);
    expect(result.modules).toHaveLength(0);
    expect(result.broken[0]?.issues[0]).toContain("entry");
  });

  test("follows symlinked addon directories", async () => {
    const root = await fixture();
    const real = await fixture();
    await mkdir(path.join(real, "linked"), { recursive: true });
    await writeFile(path.join(real, "linked", "index.ts"), "export default {};\n");
    await writeFile(
      path.join(real, "linked", "manifest.json"),
      JSON.stringify({
        apiVersion: 2,
        name: "linked",
        displayName: "Linked",
        description: "Linked",
        version: "1.0.0",
        entry: "./index.ts",
      }),
    );
    await symlink(path.join(real, "linked"), path.join(root, "linked"), "dir");

    const result = await discoverModules([{ path: root, origin: "addon" }]);
    expect(result.modules[0]?.manifest.name).toBe("linked");
  });
});

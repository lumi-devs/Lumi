import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateAddon } from "../src/validate.js";

const describeBun = describe.skipIf(typeof Bun === "undefined");

const roots: string[] = [];

async function makeAddon(
  files: Record<string, string>,
  name = "test-addon",
): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "lumi-addon-"));
  roots.push(parent);
  const dir = join(parent, name);
  await mkdir(dir);
  await writeFile(
    join(dir, "manifest.json"),
    JSON.stringify({
      apiVersion: 2,
      name,
      displayName: "Test addon",
      emoji: "🧪",
      description: "Test addon",
      version: "1.0.0",
      entry: "index.ts",
      ...JSON.parse(files["manifest.json"] ?? "{}"),
    }),
  );
  for (const [path, content] of Object.entries(files)) {
    if (path === "manifest.json") continue;
    const target = join(dir, path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, content);
  }
  if (!("index.ts" in files)) {
    await writeFile(join(dir, "index.ts"), "export default {};\n");
  }
  return dir;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describeBun("validateAddon", () => {
  it("accepts a self-contained addon", async () => {
    const dir = await makeAddon({
      "index.ts": 'import { x } from "./lib.js";\nexport default x;\n',
    });
    await expect(validateAddon(dir)).resolves.toEqual([]);
  });

  it("rejects symbolic links", async () => {
    const dir = await makeAddon({});
    await symlink(join(dir, "index.ts"), join(dir, "linked.ts"));
    await expect(validateAddon(dir)).resolves.toContainEqual(
      expect.stringContaining("symbolic links are not allowed"),
    );
  });

  it("rejects imports that escape the addon directory", async () => {
    const dir = await makeAddon({ "index.ts": 'import "../outside.js";\n' });
    await expect(validateAddon(dir)).resolves.toContainEqual(
      expect.stringContaining("escapes the addon directory"),
    );
  });

  it("rejects host-internal imports", async () => {
    const dir = await makeAddon({ "index.ts": 'import "@lumi/db";\n' });
    await expect(validateAddon(dir)).resolves.toContainEqual(
      expect.stringContaining("is internal and cannot be imported"),
    );
  });

  it("rejects undeclared third-party imports", async () => {
    const dir = await makeAddon({ "index.ts": 'import "lodash";\n' });
    await expect(validateAddon(dir)).resolves.toContainEqual(
      expect.stringContaining("not a host runtime package"),
    );
  });

  it("rejects a manifest name that does not match the directory", async () => {
    const dir = await makeAddon(
      { "manifest.json": JSON.stringify({ name: "test-addon" }) },
      "other-name",
    );
    await expect(validateAddon(dir)).resolves.toContainEqual(
      expect.stringContaining(
        'manifest name "test-addon" must match the directory name',
      ),
    );
  });
});

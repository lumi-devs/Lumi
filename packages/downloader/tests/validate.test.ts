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

  it("accepts a rudimentary supermodule without a root entry", async () => {
    const parent = await mkdtemp(join(tmpdir(), "lumi-addon-"));
    roots.push(parent);
    const dir = join(parent, "test-addon");
    await mkdir(join(dir, "status"), { recursive: true });
    await writeFile(
      join(dir, "manifest.json"),
      JSON.stringify({
        apiVersion: 2,
        name: "test-addon",
        displayName: "Test addon",
        emoji: "🧪",
        description: "Test addon",
        version: "1.0.0",
      }),
    );
    await writeFile(
      join(dir, "status", "manifest.json"),
      JSON.stringify({
        apiVersion: 2,
        name: "test-addon-status",
        displayName: "Status",
        emoji: "📊",
        description: "Status submodule",
        version: "1.0.0",
        entry: "index.ts",
      }),
    );
    await writeFile(join(dir, "status", "index.ts"), "export default {};\n");
    await expect(validateAddon(dir)).resolves.toEqual([]);
  });

  it("rejects a supermodule manifest with an entry or config", async () => {
    const dir = await makeAddon({
      "manifest.json": JSON.stringify({
        entry: "index.ts",
        configFields: [{ key: "x", label: "X", type: "string" }],
      }),
    });
    await expect(validateAddon(dir)).resolves.toContainEqual(
      expect.stringContaining("supermodule manifest must be metadata-only"),
    );
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

  it("accepts declared external npm requirements", async () => {
    const dir = await makeAddon({
      "manifest.json": JSON.stringify({
        requirements: ["lodash@^4.17.21"],
      }),
      "index.ts":
        'import { debounce } from "lodash";\nexport default debounce;\n',
    });
    await expect(validateAddon(dir)).resolves.toEqual([]);
  });

  it("rejects requirements that are not registry package specs", async () => {
    const dir = await makeAddon({
      "manifest.json": JSON.stringify({
        requirements: ["../local-package"],
      }),
    });
    await expect(validateAddon(dir)).resolves.toContainEqual(
      expect.stringContaining("is not a registry package spec"),
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

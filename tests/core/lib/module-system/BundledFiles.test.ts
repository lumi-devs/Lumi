import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  bundledModuleDir,
  readBundledFile,
} from "#src/lib/module-system/ModuleFiles.js";

const Module = "sweep-bundled-test";

const Root = path.resolve("data", "installed-modules", Module);

describe("readBundledFile", () => {
  beforeEach(async () => {
    await fs.mkdir(path.join(Root, "nested"), { recursive: true });
    await fs.writeFile(path.join(Root, "top.txt"), "top");
    await fs.writeFile(path.join(Root, "nested", "leaf.txt"), "leaf");
  });

  afterEach(async () => {
    await fs.rm(Root, { recursive: true, force: true });
  });

  it("reads files bundled with the addon", async () => {
    const top = await readBundledFile(Module, "top.txt");
    expect(top?.toString()).toBe("top");
    const leaf = await readBundledFile(Module, "nested/leaf.txt");
    expect(leaf?.toString()).toBe("leaf");
  });

  it("returns null for missing files", async () => {
    await expect(readBundledFile(Module, "nope.txt")).resolves.toBeNull();
  });

  it("refuses traversal outside the addon dir", async () => {
    await expect(readBundledFile(Module, "../escape.txt")).rejects.toThrow(
      /escapes/,
    );
  });

  it("rejects invalid module names", () => {
    expect(() => bundledModuleDir("../evil")).toThrow(/Invalid module name/);
  });
});

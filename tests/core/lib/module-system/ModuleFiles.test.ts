import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureModuleFilesDir, listModuleFiles } from "#src/lib/module-system/ModuleFiles.js";

const Module = "sweep-test";

describe("listModuleFiles", () => {
  beforeEach(async () => {
    const root = await ensureModuleFilesDir(Module);
    await fs.mkdir(path.join(root, "nested", "deep"), { recursive: true });
    await fs.writeFile(path.join(root, "top.txt"), "top");
    await fs.writeFile(path.join(root, "nested", "mid.txt"), "mid");
    await fs.writeFile(path.join(root, "nested", "deep", "leaf.txt"), "leaf");
  });

  afterEach(async () => {
    await fs.rm(path.resolve("data", "files", Module), {
      recursive: true,
      force: true,
    });
  });

  it("lists nested files under a directory prefix", async () => {
    const files = await listModuleFiles(Module, "nested");
    expect(files).toEqual(["nested/deep/leaf.txt", "nested/mid.txt"]);
  });

  it("lists everything without a prefix", async () => {
    const files = await listModuleFiles(Module);
    expect(files).toEqual([
      "nested/deep/leaf.txt",
      "nested/mid.txt",
      "top.txt",
    ]);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { container } from "@sapphire/framework";
import {
  DownloadResolver,
  MODULE_ROOT,
  ADDON_MODULES_ROOT,
} from "#lib/downloader/resolver.js";

/**
 * Verifies the real addon-installation/classification logic in
 * DownloadResolver#installModule: a module cloned into a repo under
 * MODULE_ROOT ("data/3rd-party-modules") is never loaded in place as a
 * built-in feature module. It only becomes an active addon once it passes
 * validation and is symlinked into ADDON_MODULES_ROOT
 * ("data/installed-modules"), which is the root the ModuleStore actually
 * registers for addon discovery (see LumiClient).
 */
describe("Add-on Module Classification (DownloadResolver#installModule)", () => {
  let resolver: DownloadResolver;
  const repoName = "loader-test-repo";
  const repoPath = path.join(MODULE_ROOT, repoName);

  beforeEach(async () => {
    resolver = new DownloadResolver();
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;
    await fs.mkdir(repoPath, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});
    await fs
      .rm(path.join(ADDON_MODULES_ROOT, "loader-test-mod"), {
        recursive: true,
        force: true,
      })
      .catch(() => {});
  });

  it("keeps MODULE_ROOT (raw repo checkouts) and ADDON_MODULES_ROOT (active addons) as distinct roots", () => {
    expect(MODULE_ROOT.endsWith(path.join("data", "3rd-party-modules"))).toBe(
      true,
    );
    expect(
      ADDON_MODULES_ROOT.endsWith(path.join("data", "installed-modules")),
    ).toBe(true);
    expect(MODULE_ROOT).not.toBe(ADDON_MODULES_ROOT);
  });

  it("symlinks a valid module from the repo checkout into ADDON_MODULES_ROOT instead of loading it in place", async () => {
    const moduleName = "loader-test-mod";
    const sourcePath = path.join(repoPath, moduleName);
    await fs.mkdir(sourcePath, { recursive: true });

    const info = {
      name: moduleName,
      author: ["Tester"],
      description: "Loader test module",
      short: "Loader test",
      version: "1.0.0",
      end_user_data_statement: "This addon does not store any user data.",
    };
    await fs.writeFile(
      path.join(sourcePath, "info.json"),
      JSON.stringify(info),
    );
    await fs.writeFile(
      path.join(sourcePath, "index.ts"),
      `@DefineModule({ name: "${moduleName}" })\nexport class LoaderTestModule {}`,
    );

    const result = await resolver.installModule(repoName, moduleName);
    expect(result.name).toBe(moduleName);

    const targetPath = path.join(ADDON_MODULES_ROOT, moduleName);
    const stat = await fs.lstat(targetPath);
    expect(stat.isSymbolicLink()).toBe(true);

    // The addon is activated via a symlink into ADDON_MODULES_ROOT that
    // resolves back to its real location under MODULE_ROOT/3rd-party-modules -
    // it is never copied into the built-in modules tree.
    const real = await fs.realpath(targetPath);
    expect(real).toBe(await fs.realpath(sourcePath));
    expect(real.includes(path.join("src", "modules"))).toBe(false);
  });

  it("refuses to install (and does not create an addon symlink for) a module missing info.json", async () => {
    const moduleName = "loader-test-mod";
    const sourcePath = path.join(repoPath, moduleName);
    await fs.mkdir(sourcePath, { recursive: true });
    await fs.writeFile(
      path.join(sourcePath, "index.ts"),
      `@DefineModule({ name: "${moduleName}" })\nexport class LoaderTestModule {}`,
    );

    await expect(resolver.installModule(repoName, moduleName)).rejects.toThrow(
      "has no info.json",
    );

    const targetExists = await fs
      .access(path.join(ADDON_MODULES_ROOT, moduleName))
      .then(() => true)
      .catch(() => false);
    expect(targetExists).toBe(false);
  });

  it("refuses to install a module that fails addon validation (e.g. missing index.ts)", async () => {
    const moduleName = "loader-test-mod";
    const sourcePath = path.join(repoPath, moduleName);
    await fs.mkdir(sourcePath, { recursive: true });

    const info = {
      name: moduleName,
      author: ["Tester"],
      description: "Loader test module",
      short: "Loader test",
      version: "1.0.0",
    };
    await fs.writeFile(
      path.join(sourcePath, "info.json"),
      JSON.stringify(info),
    );
    // No index.ts - validateAddon should reject this as an invalid addon.

    await expect(
      resolver.installModule(repoName, moduleName),
    ).rejects.toThrow("failed validation");

    const targetExists = await fs
      .access(path.join(ADDON_MODULES_ROOT, moduleName))
      .then(() => true)
      .catch(() => false);
    expect(targetExists).toBe(false);
  });

  it("throws when the module directory does not exist in the repo", async () => {
    await expect(
      resolver.installModule(repoName, "does-not-exist"),
    ).rejects.toThrow("not found in repo");
  });
});

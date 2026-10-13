import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { container } from "#src/lib/Services.js";
import {
  DownloadResolver,
  ModuleRoot,
  AddonModulesRoot,
} from "#src/lib/downloader/Resolver.js";

describe("Add-on Module Classification (DownloadResolver#installModule)", () => {
  let resolver: DownloadResolver;
  const repoName = "loader-test-repo";
  const repoPath = path.join(ModuleRoot, repoName);

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
      .rm(path.join(AddonModulesRoot, "loader-test-mod"), {
        recursive: true,
        force: true,
      })
      .catch(() => {});
  });

  it("keeps ModuleRoot (raw repo checkouts) and AddonModulesRoot (active addons) as distinct roots", () => {
    expect(ModuleRoot.endsWith(path.join("data", "3rd-party-modules"))).toBe(
      true,
    );
    expect(
      AddonModulesRoot.endsWith(path.join("data", "installed-modules")),
    ).toBe(true);
    expect(ModuleRoot).not.toBe(AddonModulesRoot);
  });

  it("symlinks a valid module from the repo checkout into AddonModulesRoot instead of loading it in place", async () => {
    const moduleName = "loader-test-mod";
    const sourcePath = path.join(repoPath, moduleName);
    await fs.mkdir(sourcePath, { recursive: true });

    const manifest = {
      name: moduleName,
      displayName: moduleName,
      emoji: "🧪",
      description: "Loader test module",
      version: "1.0.0",
      author: ["Tester"],
      subStores: [],
      configFields: [],
      end_user_data_statement: "This addon does not store any user data.",
    };
    await fs.writeFile(
      path.join(sourcePath, "manifest.json"),
      JSON.stringify(manifest),
    );
    await fs.writeFile(
      path.join(sourcePath, "Index.ts"),
      `import { defineModule } from "@lumi-devs/lumi/module";\nexport const meta = defineModule({ name: "${moduleName}" });`,
    );

    const result = await resolver.installModule(repoName, moduleName);
    expect(result.name).toBe(moduleName);

    const targetPath = path.join(AddonModulesRoot, moduleName);
    const stat = await fs.lstat(targetPath);
    expect(stat.isSymbolicLink()).toBe(true);

    const real = await fs.realpath(targetPath);
    expect(real).toBe(await fs.realpath(sourcePath));
    expect(real.includes(path.join("src", "modules"))).toBe(false);
  });

  it("refuses to install (and does not create an addon symlink for) a module missing manifest.json", async () => {
    const moduleName = "loader-test-mod";
    const sourcePath = path.join(repoPath, moduleName);
    await fs.mkdir(sourcePath, { recursive: true });
    await fs.writeFile(
      path.join(sourcePath, "Index.ts"),
      `import { defineModule } from "@lumi-devs/lumi/module";\nexport const meta = defineModule({ name: "${moduleName}" });`,
    );

    await expect(resolver.installModule(repoName, moduleName)).rejects.toThrow(
      "has no manifest.json",
    );

    const targetExists = await fs
      .access(path.join(AddonModulesRoot, moduleName))
      .then(() => true)
      .catch(() => false);
    expect(targetExists).toBe(false);
  });

  it("refuses to install a module that fails addon validation (e.g. missing index.ts)", async () => {
    const moduleName = "loader-test-mod";
    const sourcePath = path.join(repoPath, moduleName);
    await fs.mkdir(sourcePath, { recursive: true });

    const manifest = {
      name: moduleName,
      displayName: moduleName,
      emoji: "🧪",
      description: "Loader test module",
      version: "1.0.0",
      author: ["Tester"],
      subStores: [],
      configFields: [],
      end_user_data_statement: "d",
    };
    await fs.writeFile(
      path.join(sourcePath, "manifest.json"),
      JSON.stringify(manifest),
    );

    await expect(
      resolver.installModule(repoName, moduleName),
    ).rejects.toThrow("failed validation");

    const targetExists = await fs
      .access(path.join(AddonModulesRoot, moduleName))
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

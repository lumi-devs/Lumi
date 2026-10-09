import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "bun:test";
import { fakeSpawnResult } from "../../../tests/helpers/mock-bun-spawn.js";

// Real network/`bun add` isn't available in CI; installModule only needs
// this call to resolve so the code after it (the regression under test)
// runs. Every other resolver.ts codepath uses git too, but this test never
// reaches those.
vi.spyOn(Bun, "spawn").mockImplementation(() => fakeSpawnResult("") as any);

const { resolver, ModuleRoot, AddonModulesRoot } = await import("./resolver.js");
const { ensureAddonLumiLink } = await import("../addon-sandbox/sandbox-root.js");

const RepoName = "resolver-test-repo";
const ModuleName = "resolver-test-addon";

async function writeFixtureAddon() {
  const dir = path.join(ModuleRoot, RepoName, ModuleName);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "info.json"),
    JSON.stringify({
      name: ModuleName,
      author: ["Someone"],
      description: "Fixture addon for resolver tests.",
      short: "Fixture addon.",
      version: "1.0.0",
      requirements: ["some-package"],
      end_user_data_statement: "Resolver test privacy statement",
    }),
  );
  await fs.writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify({
      name: ModuleName,
      displayName: ModuleName,
      emoji: "🧪",
      description: "Fixture addon for resolver tests.",
      version: "1.0.0",
      targetUtility: "worker",
      subStores: [],
      configFields: [],
    }),
  );
  await fs.writeFile(
    path.join(dir, "index.ts"),
    `import { defineModule } from "lumi";\n\nexport const meta = defineModule({ name: "${ModuleName}" });\n`,
  );
  return dir;
}

describe("DownloadResolver.installModule - requirements package boundary", () => {
  afterEach(async () => {
    await fs.rm(path.join(ModuleRoot, RepoName), { recursive: true, force: true });
    await fs.rm(path.join(AddonModulesRoot, ModuleName), { recursive: true, force: true });
  });

  it("symlinks node_modules/lumi into the addon's own directory when it declares requirements", async () => {
    const sourceDir = await writeFixtureAddon();

    await resolver.installModule(RepoName, ModuleName);

    const nodeModulesLumi = path.join(sourceDir, "node_modules", "lumi");
    const stat = await fs.lstat(nodeModulesLumi);
    expect(stat.isSymbolicLink()).toBe(true);

    const target = await fs.readlink(nodeModulesLumi);
    expect(path.resolve(path.dirname(nodeModulesLumi), target)).toBe(ModuleRoot);
  });

  it("links node_modules/lumi for addons without requirements too", async () => {
    const sourceDir = await writeFixtureAddon();
    await fs.writeFile(
      path.join(sourceDir, "package.json"),
      JSON.stringify({ name: `lumi-module-${ModuleName}`, version: "1.0.0", private: true }),
    );

    await ensureAddonLumiLink(sourceDir);

    const link = path.join(sourceDir, "node_modules", "lumi");
    expect((await fs.lstat(link)).isSymbolicLink()).toBe(true);
    const target = await fs.readlink(link);
    expect(path.resolve(path.dirname(link), target)).toBe(ModuleRoot);
  });
});

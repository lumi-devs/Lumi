import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { fakeSpawnResult } from "../../helpers/MockBunSpawn.js";

beforeEach(() => {
  vi.spyOn(Bun, "spawn").mockImplementation(() => fakeSpawnResult("") as any);
});

const { resolver, ModuleRoot, AddonModulesRoot } = await import("#src/lib/downloader/Resolver.js");

const RepoName = "resolver-test-repo";
const ModuleName = "resolver-test-addon";

async function writeFixtureAddon() {
  const dir = path.join(ModuleRoot, RepoName, ModuleName);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify({
      name: ModuleName,
      displayName: ModuleName,
      emoji: "🧪",
      description: "Fixture addon for resolver tests.",
      version: "1.0.0",
      author: ["Someone"],
      requirements: ["some-package"],
      end_user_data_statement: "Resolver test privacy statement",
      subStores: [],
      configFields: [],
    }),
  );
  await fs.writeFile(
    path.join(dir, "Index.ts"),
    `import { defineModule } from "../../../../src/lib/module-system/Module.js";\n\nexport const meta = defineModule({ name: "${ModuleName}" });\n`,
  );
  return dir;
}

describe("DownloadResolver.installModule - requirements package boundary", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(path.join(ModuleRoot, RepoName), { recursive: true, force: true });
    await fs.rm(path.join(AddonModulesRoot, ModuleName), { recursive: true, force: true });
  });

  it("creates a package.json and installs requirements with bun add", async () => {
    const sourceDir = await writeFixtureAddon();

    await resolver.installModule(RepoName, ModuleName);

    const pkgRaw = await fs.readFile(path.join(sourceDir, "package.json"), "utf8");
    expect(JSON.parse(pkgRaw).name).toBe(`lumi-module-${ModuleName}`);
  });
});

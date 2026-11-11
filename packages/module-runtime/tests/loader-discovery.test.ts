import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createModuleLoader } from "../src/loader.js";

interface ModuleFixture {
  directory: string;
  manifest: Record<string, unknown>;
  definitionName?: string;
}

function moduleSource(name: string): string {
  return `export default {
  name: ${JSON.stringify(name)},
  displayName: ${JSON.stringify(name)},
  emoji: "🧪",
  description: "Loader discovery test",
  version: "1.0.0",
  config: {},
  commands: [],
  listeners: [],
  tasks: [],
  async onLoad() {
    return [];
  },
  async onUnload() {},
};
`;
}

async function writeFirmware(
  root: string,
  fixtures: readonly ModuleFixture[],
): Promise<void> {
  for (const fixture of fixtures) {
    const dir = join(root, fixture.directory);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "manifest.json"),
      JSON.stringify(fixture.manifest),
    );
    if (fixture.manifest.entry) {
      await writeFile(
        join(dir, String(fixture.manifest.entry)),
        moduleSource(fixture.definitionName ?? String(fixture.manifest.name)),
      );
    }
  }
}

function manifest(
  name: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    apiVersion: 2,
    name,
    displayName: name,
    emoji: "🧪",
    description: "Loader discovery test module",
    version: "1.0.0",
    entry: "index.mjs",
    ...extra,
  };
}

describe("ModuleLoader nested discovery", () => {
  it("loads nested modules and rejects invalid ones", async () => {
    const root = await mkdtemp(join(tmpdir(), "lumi-discovery-"));
    try {
      await writeFirmware(root, [
        {
          directory: "category/loader-valid",
          manifest: manifest("loader-valid", { category: "Testing" }),
        },
        {
          directory: "loader-missing-entry",
          manifest: {
            apiVersion: 2,
            name: "loader-missing-entry",
            displayName: "Missing Entry",
            emoji: "🧪",
            description: "A manifest without an entry",
            version: "1.0.0",
          },
        },
        {
          directory: "category/nested-folder",
          manifest: manifest("loader-nested"),
        },
        {
          directory: "loader-definition-mismatch",
          manifest: manifest("loader-definition-mismatch"),
          definitionName: "different-name",
        },
        {
          directory: "category/sub/deep-valid",
          manifest: manifest("loader-deep"),
        },
        {
          directory: "dupe-one",
          manifest: manifest("loader-dupe"),
        },
        {
          directory: "dupe-two",
          manifest: manifest("loader-dupe"),
        },
      ]);

      const loader = createModuleLoader();
      loader.addRoot(root, "bundled");
      const discovered = await loader.discover();

      expect(discovered.map((module) => module.manifest.name)).toEqual([
        "loader-deep",
        "loader-dupe",
        "loader-nested",
        "loader-valid",
      ]);

      const loaded = await loader.loadAll(discovered, {} as never);
      expect(loaded.map((module) => module.manifest.name)).toEqual([
        "loader-deep",
        "loader-dupe",
        "loader-nested",
        "loader-valid",
      ]);
      expect(loader.listGlobal()).toContainEqual(
        expect.objectContaining({
          name: "loader-valid",
          category: "Testing",
          origin: "bundled",
        }),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

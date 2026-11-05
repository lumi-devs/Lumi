import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createModuleLoader } from "../src/loader.js";

const CounterKey = "__lumiLoaderDisposerCount";

function counter(): number {
  return (globalThis as Record<string, unknown>)[CounterKey] as number;
}

async function writeModuleFixture(root: string): Promise<void> {
  const supermodule = join(root, "loader-test");
  const submodule = join(supermodule, "demo");
  await mkdir(submodule, { recursive: true });

  await writeFile(
    join(supermodule, "manifest.json"),
    JSON.stringify({
      apiVersion: 2,
      name: "loader-test",
      displayName: "Loader Test",
      emoji: "🧪",
      description: "Loader disposer test supermodule",
      version: "1.0.0",
    }),
  );
  await writeFile(
    join(submodule, "manifest.json"),
    JSON.stringify({
      apiVersion: 2,
      name: "loader-test-demo",
      displayName: "Loader Test Demo",
      emoji: "🧪",
      description: "Loader disposer test submodule",
      version: "1.0.0",
      entry: "index.mjs",
    }),
  );
  await writeFile(
    join(submodule, "index.mjs"),
    `export default {
  name: "loader-test-demo",
  displayName: "Loader Test Demo",
  emoji: "🧪",
  description: "Loader disposer test submodule",
  version: "1.0.0",
  config: {},
  commands: [],
  listeners: [],
  tasks: [],
  async onLoad() {
    return [
      () => {
        globalThis.${CounterKey} = (globalThis.${CounterKey} ?? 0) + 1;
      },
    ];
  },
  async onUnload() {},
};
`,
  );
}

describe("ModuleLoader disposers", () => {
  it("runs onLoad disposers when reloading and unloading modules", async () => {
    const root = await mkdtemp(join(tmpdir(), "lumi-loader-"));
    (globalThis as Record<string, unknown>)[CounterKey] = 0;
    try {
      await writeModuleFixture(root);
      const loader = createModuleLoader();
      loader.addRoot(root, "bundled");
      await loader.loadAll(await loader.discover(), {} as never);

      expect(loader.getModule("loader-test-demo")).toBeDefined();

      await loader.reload("loader-test");
      expect(counter()).toBe(0);

      await loader.reload("loader-test-demo");
      expect(counter()).toBe(1);

      await loader.unload("loader-test");
      expect(counter()).toBe(2);
      expect(loader.getModule("loader-test-demo")).toBeUndefined();
    } finally {
      delete (globalThis as Record<string, unknown>)[CounterKey];
      await rm(root, { recursive: true, force: true });
    }
  });
});

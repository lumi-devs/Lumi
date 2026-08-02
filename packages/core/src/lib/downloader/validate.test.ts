import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateAddon } from "./validate.js";

const VALID_INFO = JSON.stringify({
  name: "my-addon",
  author: ["Someone"],
  description: "A test addon.",
  short: "Test addon.",
  version: "1.0.0",
});

async function writeAddon(dir: string, indexSrc: string, infoJson = VALID_INFO) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "info.json"), infoJson);
  await fs.writeFile(path.join(dir, "index.ts"), indexSrc);
}

describe("validateAddon - lumi SDK import boundary", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lumi-addon-validate-"));
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("does not warn when the addon imports from the public lumi SDK", async () => {
    const dir = path.join(tmpRoot, "my-addon");
    await writeAddon(
      dir,
      `import { Module, DefineModule, cfg } from "lumi";\nimport { BaseCommand } from "lumi/commands";\n\n@DefineModule({ name: "my-addon" })\nexport class MyAddon extends Module {}\n`,
    );

    const { warnings } = await validateAddon(dir);
    expect(warnings).toEqual([]);
  });

  it.each([
    "#core/module-system/Module.js",
    "#lib/commands.js",
    "#utilities/cards.js",
    "#database/redis.js",
    "#root/foo.js",
  ])("warns when the addon imports Lumi's internal path %s directly", async (internalPath) => {
    const dir = path.join(tmpRoot, "my-addon");
    await writeAddon(
      dir,
      `import { Module, DefineModule } from "${internalPath}";\n\n@DefineModule({ name: "my-addon" })\nexport class MyAddon extends Module {}\n`,
    );

    const { warnings, errors } = await validateAddon(dir);
    expect(warnings.some((w) => w.includes(internalPath) && w.includes('"lumi"'))).toBe(true);
    // Internal-path imports are a warning, not a hard failure.
    expect(errors).toEqual([]);
  });

  it("still hard-errors on importing another module via #modules/*", async () => {
    const dir = path.join(tmpRoot, "my-addon");
    await writeAddon(
      dir,
      `import { Module, DefineModule } from "lumi";\nimport { something } from "#modules/other/index.js";\n\n@DefineModule({ name: "my-addon" })\nexport class MyAddon extends Module {}\n`,
    );

    const { errors } = await validateAddon(dir);
    expect(errors.some((e) => e.includes("must be self-contained"))).toBe(true);
  });
});

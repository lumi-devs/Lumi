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

describe("validateAddon - memory-leak heuristics", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lumi-addon-validate-"));
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  const HEADER = `import { Module, DefineModule } from "lumi";\n\n`;

  it("warns on an unstored setInterval/setTimeout handle", async () => {
    const dir = path.join(tmpRoot, "my-addon");
    await writeAddon(
      dir,
      `${HEADER}setInterval(() => {}, 1000);\nsetTimeout(() => {}, 1000);\n\n@DefineModule({ name: "my-addon" })\nexport class MyAddon extends Module {}\n`,
    );

    const { warnings } = await validateAddon(dir);
    expect(warnings.some((w) => w.includes("setInterval(...)") && w.includes("clearInterval"))).toBe(true);
    expect(warnings.some((w) => w.includes("setTimeout(...)") && w.includes("clearTimeout"))).toBe(true);
  });

  it("warns when a stored timer handle is never cleared", async () => {
    const dir = path.join(tmpRoot, "my-addon");
    await writeAddon(
      dir,
      `${HEADER}const handle = setInterval(() => {}, 1000);\n\n@DefineModule({ name: "my-addon" })\nexport class MyAddon extends Module {}\n`,
    );

    const { warnings } = await validateAddon(dir);
    expect(warnings.some((w) => w.includes("`handle`") && w.includes("clearInterval(handle)"))).toBe(true);
  });

  it("does not warn when a stored timer handle is cleared", async () => {
    const dir = path.join(tmpRoot, "my-addon");
    await writeAddon(
      dir,
      `${HEADER}const handle = setInterval(() => {}, 1000);\nclearInterval(handle);\n\n@DefineModule({ name: "my-addon" })\nexport class MyAddon extends Module {}\n`,
    );

    const { warnings } = await validateAddon(dir);
    expect(warnings.some((w) => w.includes("setInterval"))).toBe(false);
  });

  it("does not warn when a property-assigned timer handle is cleared elsewhere", async () => {
    const dir = path.join(tmpRoot, "my-addon");
    await writeAddon(
      dir,
      `${HEADER}class Thing {\n  timer: NodeJS.Timeout;\n  start() { this.timer = setInterval(() => {}, 1000); }\n  stop() { clearInterval(this.timer); }\n}\n\n@DefineModule({ name: "my-addon" })\nexport class MyAddon extends Module {}\n`,
    );

    const { warnings } = await validateAddon(dir);
    expect(warnings.some((w) => w.includes("setInterval"))).toBe(false);
  });

  it("warns on a .on(...) listener registration with no visible cleanup", async () => {
    const dir = path.join(tmpRoot, "my-addon");
    await writeAddon(
      dir,
      `${HEADER}process.on("uncaughtException", () => {});\n\n@DefineModule({ name: "my-addon" })\nexport class MyAddon extends Module {}\n`,
    );

    const { warnings } = await validateAddon(dir);
    expect(warnings.some((w) => w.includes(".on(...)/.addListener(...)"))).toBe(true);
  });

  it("does not warn on a .on(...) listener when onUnload is present in the same file", async () => {
    const dir = path.join(tmpRoot, "my-addon");
    await writeAddon(
      dir,
      `${HEADER}process.on("uncaughtException", () => {});\n\n@DefineModule({ name: "my-addon" })\nexport class MyAddon extends Module {\n  onUnload() { /* cleanup */ }\n}\n`,
    );

    const { warnings } = await validateAddon(dir);
    expect(warnings.some((w) => w.includes(".on(...)/.addListener(...)"))).toBe(false);
  });

  it("warns on module-level mutable `let`", async () => {
    const dir = path.join(tmpRoot, "my-addon");
    await writeAddon(
      dir,
      `${HEADER}let activeGiveaways = 0;\n\n@DefineModule({ name: "my-addon" })\nexport class MyAddon extends Module {}\n`,
    );

    const { warnings } = await validateAddon(dir);
    expect(warnings.some((w) => w.includes("module-level `let activeGiveaways`"))).toBe(true);
  });

  it("warns on an unbounded module-level collection that is pushed to but never trimmed", async () => {
    const dir = path.join(tmpRoot, "my-addon");
    await writeAddon(
      dir,
      `${HEADER}const seen = new Map();\n\nfunction track(id: string) { seen.set(id, Date.now()); }\n\n@DefineModule({ name: "my-addon" })\nexport class MyAddon extends Module {}\n`,
    );

    const { warnings } = await validateAddon(dir);
    expect(warnings.some((w) => w.includes("module-level `seen`") && w.includes("unbounded"))).toBe(true);
  });

  it("does not warn on a module-level collection that is bounded", async () => {
    const dir = path.join(tmpRoot, "my-addon");
    await writeAddon(
      dir,
      `${HEADER}const seen = new Map();\n\nfunction track(id: string) {\n  if (seen.size > 100) seen.clear();\n  seen.set(id, Date.now());\n}\n\n@DefineModule({ name: "my-addon" })\nexport class MyAddon extends Module {}\n`,
    );

    const { warnings } = await validateAddon(dir);
    expect(warnings.some((w) => w.includes("module-level `seen`"))).toBe(false);
  });

  it("all leak heuristics are warnings, never errors", async () => {
    const dir = path.join(tmpRoot, "my-addon");
    await writeAddon(
      dir,
      `${HEADER}let counter = 0;\nconst seen = [];\nsetInterval(() => { seen.push(counter++); }, 1000);\nprocess.on("SIGTERM", () => {});\n\n@DefineModule({ name: "my-addon" })\nexport class MyAddon extends Module {}\n`,
    );

    const { errors, warnings } = await validateAddon(dir);
    expect(errors).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

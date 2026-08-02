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

describe("validateAddon - min_bot_version semver compatibility", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lumi-addon-semver-"));
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  const VALID_INDEX = `import { Module, DefineModule } from "lumi";\n\n@DefineModule({ name: "my-addon" })\nexport class MyAddon extends Module {}\n`;

  async function writeWithMinBotVersion(dir: string, minBotVersion: string) {
    const info = JSON.stringify({
      name: "my-addon",
      author: ["Someone"],
      description: "A test addon.",
      short: "Test addon.",
      version: "1.0.0",
      min_bot_version: minBotVersion,
    });
    await writeAddon(dir, VALID_INDEX, info);
  }

  it("flags a pre-release min_bot_version whose numeric part exceeds the current version (1.0.0)", async () => {
    // The old hand-rolled parser split on "." and ran `Number(...)` per segment,
    // so "1.0.1-beta" -> Number("1-beta") -> NaN -> defaulted to 0, silently
    // parsing the requirement as 1.0.0 (== current) instead of 1.0.1 (> current).
    // That made an addon requiring a not-yet-released bot version look compatible.
    const dir = path.join(tmpRoot, "my-addon");
    await writeWithMinBotVersion(dir, "1.0.1-beta");

    const { errors } = await validateAddon(dir);
    expect(errors.some((e) => e.includes("min_bot_version"))).toBe(true);
  });

  it("flags a min_bot_version with build metadata whose numeric part exceeds the current version", async () => {
    // Same class of bug as above via the "+build" suffix: "1.0.1+build.5" ->
    // Number("1+build") -> NaN -> 0, so the requirement was silently downgraded
    // to 1.0.0 and incorrectly treated as satisfied.
    const dir = path.join(tmpRoot, "my-addon");
    await writeWithMinBotVersion(dir, "1.0.1+build.5");

    const { errors } = await validateAddon(dir);
    expect(errors.some((e) => e.includes("min_bot_version"))).toBe(true);
  });

  it("accepts a v-prefixed min_bot_version that the current version satisfies", async () => {
    const dir = path.join(tmpRoot, "my-addon");
    await writeWithMinBotVersion(dir, "v0.9.0");

    const { errors } = await validateAddon(dir);
    expect(errors.some((e) => e.includes("min_bot_version"))).toBe(false);
  });

  it("correctly ranks multi-digit minor versions (1.10.0 > 1.9.0) instead of comparing lexically", async () => {
    const dir = path.join(tmpRoot, "my-addon");
    // Current Lumi version is fixed at 1.0.0, so a min_bot_version of 1.10.0 is
    // never satisfiable - this pins the numeric (not lexical) comparison.
    await writeWithMinBotVersion(dir, "1.10.0");

    const { errors } = await validateAddon(dir);
    expect(errors.some((e) => e.includes("min_bot_version"))).toBe(true);
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

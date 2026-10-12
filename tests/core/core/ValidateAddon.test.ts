import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateAddon } from "#src/lib/downloader/Validate.js";

let root: string;

const GOOD_INDEX = `import { defineModule } from "../../../../src/lib/module-system/Module.js";
export const meta = defineModule({ name: "sample", displayName: "Sample", emoji: "🧪", version: "1.0.0", description: "d" });
`;

async function makeAddon(
  name: string,
  files: Record<string, string>,
  dirs: string[] = [],
): Promise<string> {
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  for (const d of dirs) await fs.mkdir(path.join(dir, d), { recursive: true });

  if (!files["manifest.json"]) {
    files["manifest.json"] = JSON.stringify({
      name,
      displayName: name,
      emoji: "🧪",
      description: "d",
      version: "1.0.0",
      author: ["Tester"],
      targetUtility: "worker",
      subStores: [],
      configFields: [],
      end_user_data_statement: "d",
    });
  }
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  return dir;
}

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "lumi-validate-"));
});
afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("validateAddon", () => {
  it("passes a well-formed addon", async () => {
    const dir = await makeAddon("sample", {
      "Index.ts": GOOD_INDEX,
    });
    const { errors, warnings } = await validateAddon(dir);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("flags a missing manifest.json and index.ts", async () => {
    const dir = path.join(root, "empty");
    await fs.mkdir(dir, { recursive: true });
    const { errors } = await validateAddon(dir);
    expect(errors.some((e) => e.includes("manifest.json"))).toBe(true);
    expect(errors.some((e) => e.includes("Index.ts"))).toBe(true);
  });

  it("flags a manifest.json name that doesn't match the directory", async () => {
    const dir = await makeAddon("mismatch", {
      "manifest.json": JSON.stringify({
        name: "other",
        displayName: "other",
        emoji: "🧪",
        description: "d",
        version: "1.0.0",
        author: ["T"],
        targetUtility: "worker",
        subStores: [],
        configFields: [],
        end_user_data_statement: "d",
      }),
      "Index.ts": GOOD_INDEX,
    });
    const { errors } = await validateAddon(dir);
    expect(errors.some((e) => e.includes("must match the directory"))).toBe(true);
  });

  it("allows tasks/ directories (addons own their tasks in-process)", async () => {
    const dir = await makeAddon(
      "trap-tasks",
      { "Index.ts": GOOD_INDEX },
      ["tasks"],
    );
    const { errors } = await validateAddon(dir);
    expect(errors.some((e) => e.includes("tasks"))).toBe(false);
  });

  it("flags EmbedBuilder usage", async () => {
    const dir = await makeAddon("embed", {
      "Index.ts": GOOD_INDEX,
      "commands/x.ts": `import { EmbedBuilder } from "discord.js";\nexport const e = new EmbedBuilder();\n`,
    });
    const { errors } = await validateAddon(dir);
    expect(errors.some((e) => e.includes("EmbedBuilder"))).toBe(true);
  });

  it("flags a relative import that escapes the addon", async () => {
    const dir = await makeAddon("escape", {
      "Index.ts": GOOD_INDEX,
      "lib/x.ts": `import { thing } from "../../other-addon/lib/thing.js";\nexport { thing };\n`,
    });
    const { errors } = await validateAddon(dir);
    expect(errors.some((e) => e.includes("escapes the addon"))).toBe(true);
  });

  it("flags any use of Sapphire's container, which does not exist in an addon process", async () => {
    const dir = await makeAddon("prisma", {
      "Index.ts": `${GOOD_INDEX}\nconst x = container.prisma.user;\n`,
    });
    const { errors } = await validateAddon(dir);
    expect(errors.some((e) => e.includes("container"))).toBe(true);
  });

  it("passes shared #lib imports and flags dead @lumi/#core aliases", async () => {
    const dir = await makeAddon("aliases", {
      "Index.ts": GOOD_INDEX,
      "lib/x.ts": `import { makeInfoCard } from "#src/lib/ui/Cards.js";\nimport { Utility } from "#src/lib/module-system/Utility.js";\nimport { x } from "@lumi/lib/ui/other.js";\nimport { y } from "#core/thing.js";\nexport { makeInfoCard, Service };\n`,
    });
    const { errors } = await validateAddon(dir);
    expect(errors.some((e) => e.includes("#lib/ui/Cards.js"))).toBe(false);
    expect(errors.some((e) => e.includes("#lib/module-system/utility.js"))).toBe(false);
    expect(errors.some((e) => e.includes("@lumi/lib/ui/other.js") && e.includes("does not resolve"))).toBe(true);
    expect(errors.some((e) => e.includes("#core/thing.js") && e.includes("does not resolve"))).toBe(true);
  });

  it("blocks bot-internals imports (closes the container.prisma bypass)", async () => {
    const dir = await makeAddon("database-bypass", {
      "Index.ts": `${GOOD_INDEX}\nimport { prisma } from "#src/lib/prisma/Client.js";\nexport { prisma };\n`,
    });
    const { errors } = await validateAddon(dir);
    expect(errors.some((e) => e.includes("#src/lib/prisma/Client.js") && e.includes("bot internals"))).toBe(true);
  });

  it("validates a valid manifest.json contract", async () => {
    const dir = await makeAddon("valid-manifest", {
      "Index.ts": `import { defineModule } from "../../../../src/lib/module-system/Module.js";\nexport const meta = defineModule({ name: "valid-manifest", displayName: "M", emoji: "🧪", version: "1.0.0", description: "d" });\n`,
      "manifest.json": JSON.stringify({
        name: "valid-manifest",
        displayName: "M",
        emoji: "🧪",
        description: "d",
        version: "1.0.0",
        author: ["T"],
        subStores: [],
        configFields: [],
        end_user_data_statement: "Valid privacy statement",
      }),
    });
    const { errors } = await validateAddon(dir);
    expect(errors).toEqual([]);
  });

  it("accepts plain-name and ranged semver dependencies in manifest.json", async () => {
    const dir = await makeAddon("ranged-deps", {
      "Index.ts": GOOD_INDEX,
      "manifest.json": JSON.stringify({
        name: "ranged-deps",
        displayName: "M",
        emoji: "🧪",
        description: "d",
        version: "1.0.0",
        author: ["T"],
        subStores: [],
        configFields: [],
        end_user_data_statement: "d",
        dependencies: ["economy", "leveling@^1.2.0"],
      }),
    });
    const { errors } = await validateAddon(dir);
    expect(errors).toEqual([]);
  });

  it("flags a dependency entry with an invalid semver range", async () => {
    const dir = await makeAddon("bad-range", {
      "manifest.json": JSON.stringify({
        name: "bad-range",
        displayName: "M",
        emoji: "🧪",
        description: "d",
        version: "1.0.0",
        author: ["T"],
        subStores: [],
        configFields: [],
        end_user_data_statement: "d",
        dependencies: ["leveling@not-a-range"],
      }),
      "Index.ts": GOOD_INDEX,
    });
    const { errors } = await validateAddon(dir);
    expect(
      errors.some((e) => e.includes('"leveling@not-a-range"') && e.includes("manifest.json")),
    ).toBe(true);
  });

  it("flags a dependency entry with an invalid module name", async () => {
    const dir = await makeAddon("bad-name", {
      "manifest.json": JSON.stringify({
        name: "bad-name",
        displayName: "M",
        emoji: "🧪",
        description: "d",
        version: "1.0.0",
        author: ["T"],
        subStores: [],
        configFields: [],
        end_user_data_statement: "d",
        dependencies: ["Not Valid@^1.0.0"],
      }),
      "Index.ts": GOOD_INDEX,
    });
    const { errors } = await validateAddon(dir);
    expect(errors.some((e) => e.includes('"Not Valid@^1.0.0"'))).toBe(true);
  });

  it("warns on user-facing replies without the locale pipeline", async () => {
    const dir = await makeAddon("no-locale", {
      "Index.ts": GOOD_INDEX,
      "commands/x.ts": `export async function run(ctx: any) { await ctx.replySuccess("Done", "It worked."); }\n`,
    });
    const { errors, warnings } = await validateAddon(dir);
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes("locale pipeline"))).toBe(true);
  });

  it("stays quiet when replies go through fetchT", async () => {
    const dir = await makeAddon("with-locale", {
      "Index.ts": GOOD_INDEX,
      "commands/x.ts": `export async function run(ctx: any) { const t = await ctx.fetchT(); await ctx.replySuccess(t("commands:doneTitle"), t("commands:doneBody")); }\n`,
    });
    const { warnings } = await validateAddon(dir);
    expect(warnings.some((w) => w.includes("locale pipeline"))).toBe(false);
  });

  it("flags an invalid manifest.json schema or mismatched name", async () => {
    const dir = await makeAddon("bad-manifest", {
      "Index.ts": `import { defineModule } from "../../../../src/lib/module-system/Module.js";\n@DefineModule({ name: "bad-manifest", displayName: "B", emoji: "🧪", version: "1.0.0", description: "d" })\nexport class BModule extends Module {}\n`,
      "manifest.json": JSON.stringify({
        name: "mismatched-name",
        displayName: "B",
        emoji: "🧪",
        description: "d",
        version: "1.0.0",
        author: ["T"],
        subStores: [],
        configFields: [],
        end_user_data_statement: "d",
      }),
    });
    const { errors } = await validateAddon(dir);
    expect(errors.some((e) => e.includes("manifest.json"))).toBe(true);
  });
});

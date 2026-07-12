import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateAddon } from "#lib/lib/downloader/validate.js";

let root: string;

const GOOD_INFO = JSON.stringify({
  name: "sample",
  author: ["Tester"],
  description: "A sample addon.",
  short: "Sample.",
  version: "1.0.0",
});
const GOOD_INDEX = `import { Module, DefineModule } from "#lib/module-system/Module.js";
@DefineModule({ name: "sample", displayName: "Sample", emoji: "🧪", version: "1.0.0", description: "d" })
export class SampleModule extends Module {}
`;

async function makeAddon(
  name: string,
  files: Record<string, string>,
  dirs: string[] = [],
): Promise<string> {
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  for (const d of dirs) await fs.mkdir(path.join(dir, d), { recursive: true });
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
      "info.json": GOOD_INFO,
      "index.ts": GOOD_INDEX,
    });
    const { errors, warnings } = await validateAddon(dir);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("flags a missing info.json and index.ts", async () => {
    const dir = await makeAddon("empty", {});
    const { errors } = await validateAddon(dir);
    expect(errors.some((e) => e.includes("info.json"))).toBe(true);
    expect(errors.some((e) => e.includes("index.ts"))).toBe(true);
  });

  it("flags an info.json name that doesn't match the directory", async () => {
    const dir = await makeAddon("mismatch", {
      "info.json": JSON.stringify({
        name: "other",
        author: ["T"],
        description: "d",
        short: "s",
        version: "1.0.0",
      }),
      "index.ts": GOOD_INDEX,
    });
    const { errors } = await validateAddon(dir);
    expect(errors.some((e) => e.includes("must match the directory"))).toBe(true);
  });

  it("flags the tasks/ naming trap", async () => {
    const dir = await makeAddon(
      "trap",
      { "info.json": JSON.stringify({ name: "trap", author: ["T"], description: "d", short: "s", version: "1.0.0" }), "index.ts": GOOD_INDEX },
      ["tasks"],
    );
    const { errors } = await validateAddon(dir);
    expect(errors.some((e) => e.includes("scheduled-tasks/"))).toBe(true);
  });

  it("flags EmbedBuilder usage", async () => {
    const dir = await makeAddon("embed", {
      "info.json": JSON.stringify({ name: "embed", author: ["T"], description: "d", short: "s", version: "1.0.0" }),
      "index.ts": GOOD_INDEX,
      "commands/x.ts": `import { EmbedBuilder } from "discord.js";\nexport const e = new EmbedBuilder();\n`,
    });
    const { errors } = await validateAddon(dir);
    expect(errors.some((e) => e.includes("EmbedBuilder"))).toBe(true);
  });

  it("flags a relative import that escapes the addon", async () => {
    const dir = await makeAddon("escape", {
      "info.json": JSON.stringify({ name: "escape", author: ["T"], description: "d", short: "s", version: "1.0.0" }),
      "index.ts": GOOD_INDEX,
      "lib/x.ts": `import { thing } from "../../other-addon/lib/thing.js";\nexport { thing };\n`,
    });
    const { errors } = await validateAddon(dir);
    expect(errors.some((e) => e.includes("escapes the addon"))).toBe(true);
  });

  it("flags container.prisma access", async () => {
    const dir = await makeAddon("prisma", {
      "info.json": JSON.stringify({ name: "prisma", author: ["T"], description: "d", short: "s", version: "1.0.0" }),
      "index.ts": `${GOOD_INDEX}\nconst x = container.prisma.user;\n`,
    });
    const { errors } = await validateAddon(dir);
    expect(errors.some((e) => e.includes("container.prisma"))).toBe(true);
  });

  it("allows #core/#utilities alias imports (does not flag them as escapes)", async () => {
    const dir = await makeAddon("aliases", {
      "info.json": JSON.stringify({ name: "aliases", author: ["T"], description: "d", short: "s", version: "1.0.0" }),
      "index.ts": GOOD_INDEX,
      "lib/x.ts": `import { makeInfoCard } from "#lib/utilities/cards.js";\nimport { Service } from "#lib/module-system/Service.js";\nexport { makeInfoCard, Service };\n`,
    });
    const { errors } = await validateAddon(dir);
    expect(errors).toEqual([]);
  });
});

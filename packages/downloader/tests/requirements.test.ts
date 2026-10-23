import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLogger } from "@lumi/foundation";
import { installAddonRequirements, parseRequirements } from "../src/requirements.ts";

const roots: string[] = [];
const logger = createLogger({ name: "test", level: "silent" });

async function addon(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "lumi-deps-"));
  roots.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("addon requirements", () => {
  test("parses names, versions, and scoped packages", () => {
    const result = parseRequirements([
      "lodash@^4.17.21",
      "is-number",
      "@scope/pkg@~1.2.3",
      "discord.js@^14.0.0",
    ]);

    expect(result.errors).toEqual([]);
    expect(result.declared.get("lodash")).toBe("^4.17.21");
    expect(result.declared.get("is-number")).toBe("*");
    expect(result.declared.get("@scope/pkg")).toBe("~1.2.3");
    expect(result.install.has("discord.js")).toBe(false);
  });

  test("rejects non-registry specs and bot internals", () => {
    const result = parseRequirements([
      "lodash@git+https://example.invalid/lodash",
      "left-pad@file:../left-pad",
      "@lumi/db@^1.0.0",
      "@scope",
    ]);

    const errors = result.errors.join("\n");
    expect(errors).toContain("registry semver range");
    expect(errors).toContain("bot internal");
    expect(errors).toContain("invalid package name");
  });

  test("rejects conflicting duplicate requirements", () => {
    const result = parseRequirements(["lodash@^4.0.0", "lodash@^3.0.0"]);
    expect(result.errors.join("\n")).toContain("conflicting versions");
  });

  test("skips install when only host packages are required", async () => {
    const dir = await addon();
    await installAddonRequirements(dir, ["discord.js@^14.0.0"], logger);
    expect(await Bun.file(path.join(dir, "package.json")).exists()).toBe(false);
  });
});

import { describe, expect, it, beforeAll } from "bun:test";
import { ensureSandboxRoot } from "./sandbox-root.js";

/**
 * Resolution is the boundary. An addon file's nearest package.json is the one
 * `ensureSandboxRoot` writes, which maps `lumi` and nothing else, so what must
 * be asserted is both what resolves and what does not.
 */
describe("lumi addon SDK resolution", () => {
  const repoRoot = new URL("../../../../../", import.meta.url);
  const fakeAddonFile = new URL(
    "data/3rd-party-modules/some-repo/some-addon/index.ts",
    repoRoot,
  ).href;

  beforeAll(async () => {
    await ensureSandboxRoot();
  });

  it("resolves the top-level lumi specifier through the sandbox root", async () => {
    const resolved = await import.meta.resolve("lumi", fakeAddonFile);
    expect(resolved).toContain("data/3rd-party-modules/.lumi-sdk/index.ts");
  });

  it.each([
    "commands",
    "config",
    "discord",
    "interactions",
    "kv",
    "permissions",
    "redis",
    "scheduling",
    "ui",
    "utils",
  ])("resolves lumi/%s", async (subpath) => {
    const resolved = await import.meta.resolve(`lumi/${subpath}`, fakeAddonFile);
    expect(resolved).toContain(`.lumi-sdk/${subpath}.ts`);
  });

  it.each([
    "#lib/env.js",
    "#lib/commands.js",
    "#database/redis.js",
    "#utilities/misc.js",
    "#modules/mod/index.js",
    "#root/main.js",
  ])("refuses to resolve the internal specifier %s", (specifier) => {
    expect(() => import.meta.resolve(specifier, fakeAddonFile)).toThrow();
  });

  it("refuses a lumi subpath that is not in the map", () => {
    expect(() => import.meta.resolve("lumi/internals", fakeAddonFile)).toThrow();
  });

  it("exposes the module fundamentals from the top-level import", async () => {
    const sdk = await import("./sdk/index.js");
    expect(sdk.Module).toBeTypeOf("function");
    expect(sdk.DefineModule).toBeTypeOf("function");
    expect(sdk.cfg).toBeDefined();
  });

  it("exposes command base classes from lumi/commands", async () => {
    const commands = await import("./sdk/commands.js");
    expect(commands.BaseCommand).toBeTypeOf("function");
    expect(commands.BaseSubcommand).toBeTypeOf("function");
    expect(commands.CommandContext).toBeTypeOf("function");
  });

  it("exposes card helpers from lumi/ui", async () => {
    const ui = await import("./sdk/ui.js");
    expect(ui.makeSuccessCard).toBeTypeOf("function");
    expect(ui.makeErrorCard).toBeTypeOf("function");
    expect(ui.Emojis).toBeDefined();
  });

  it("hands out no Discord client, database or Redis handle", async () => {
    const sdk = await import("./sdk/index.js");
    const surface = Object.keys(sdk);
    expect(surface).not.toContain("container");
    expect(surface).not.toContain("Utility");
    expect(surface).not.toContain("getUtility");
    const utils = await import("./sdk/utils.js");
    expect(Object.keys(utils)).not.toContain("acquireRedisLock");
  });
});

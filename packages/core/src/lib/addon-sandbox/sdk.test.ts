import { describe, expect, it } from "vitest";

/**
 * The addon SDK is reachable exactly the way addon code reaches it: as a bare
 * `"lumi"` / `"lumi/*"` specifier, from a file where the Downloader actually
 * puts addons. What matters as much as the resolutions that succeed are the
 * ones that must fail — an addon process resolves `lumi` and nothing else.
 */
describe("lumi addon SDK resolution", () => {
  // This file lives at packages/core/src/lib/addon-sandbox/; five levels up
  // from its directory is the repo root.
  const repoRoot = new URL("../../../../../", import.meta.url);
  const fakeAddonFile = new URL(
    "data/3rd-party-modules/some-repo/some-addon/index.ts",
    repoRoot,
  ).href;

  it("resolves the top-level lumi specifier to the sandbox SDK", async () => {
    const resolved = await import.meta.resolve("lumi", fakeAddonFile);
    expect(resolved).toContain("addon-sandbox/sdk/index.ts");
  });

  it.each([
    "lumi/commands",
    "lumi/config",
    "lumi/discord",
    "lumi/kv",
    "lumi/permissions",
    "lumi/ui",
    "lumi/utils",
  ])("resolves the %s subpath", async (specifier) => {
    const resolved = await import.meta.resolve(specifier, fakeAddonFile);
    expect(resolved).toContain(`addon-sandbox/sdk/${specifier.split("/")[1]}.ts`);
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

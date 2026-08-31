import { describe, expect, it } from "vitest";

/**
 * Verifies the addon SDK is reachable exactly the way real addon code reaches
 * it: as a bare `"lumi"` / `"lumi/*"` specifier resolved via Node/Bun package
 * self-reference against the repo root's package.json (name "lumi"), from a
 * file location that mirrors where the Downloader actually puts addons
 * (outside packages/core, inside this repo's own directory tree - see the
 * root package.json's `comment:imports`/`comment:exports` fields).
 */
describe("lumi addon SDK resolution", () => {
  // This test file lives at packages/core/src/lib/addon-sdk.test.ts; four
  // levels up from its directory is the repo root.
  const repoRoot = new URL("../../../../", import.meta.url);
  const fakeAddonFile = new URL(
    "data/3rd-party-modules/some-repo/some-addon/index.ts",
    repoRoot,
  ).href;

  it("resolves the top-level lumi specifier", async () => {
    const resolved = await import.meta.resolve("lumi", fakeAddonFile);
    expect(resolved).toContain("addon-sdk/index.ts");
  });

  it.each([
    "lumi/commands",
    "lumi/permissions",
    "lumi/scheduling",
    "lumi/ui",
    "lumi/utils",
  ])("resolves the %s subpath", async (specifier) => {
    const resolved = await import.meta.resolve(specifier, fakeAddonFile);
    expect(resolved).toContain(`addon-sdk/${specifier.split("/")[1]}.ts`);
  });

  it("exposes the module-system fundamentals every addon needs from the top-level import", async () => {
    const sdk = await import("./addon-sdk/index.js");
    expect(sdk.Module).toBeTypeOf("function");
    expect(sdk.DefineModule).toBeTypeOf("function");
    expect(sdk.cfg).toBeDefined();
    expect(sdk.Utility).toBeTypeOf("function");
    expect(sdk.getUtility).toBeTypeOf("function");
  });

  it("exposes command base classes from lumi/commands", async () => {
    const commands = await import("./addon-sdk/commands.js");
    expect(commands.BaseCommand).toBeTypeOf("function");
    expect(commands.BaseSubcommand).toBeTypeOf("function");
    expect(commands.CommandContext).toBeTypeOf("function");
  });

  it("exposes isModuleEnabled from lumi/permissions (regression: used to point at a deleted file)", async () => {
    const permissions = await import("./addon-sdk/permissions.js");
    expect(permissions.isModuleEnabled).toBeTypeOf("function");
    expect(permissions.checkModulesEnabled).toBeTypeOf("function");
  });

  it("exposes card + UI helpers from lumi/ui", async () => {
    const ui = await import("./addon-sdk/ui.js");
    expect(ui.makeSuccessCard).toBeTypeOf("function");
    expect(ui.makeErrorCard).toBeTypeOf("function");
    expect(ui.confirmPrompt).toBeTypeOf("function");
    expect(ui.Emojis).toBeDefined();
  });

  it("exposes scheduling primitives from lumi/scheduling", async () => {
    const scheduling = await import("./addon-sdk/scheduling.js");
    expect(scheduling.RelayTask).toBeTypeOf("function");
    expect(scheduling.scheduleTask).toBeTypeOf("function");
    expect(scheduling.registerTaskFireHandler).toBeTypeOf("function");
  });
});

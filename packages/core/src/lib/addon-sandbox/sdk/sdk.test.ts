import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureAddonLumiLink } from "../host/sandbox-root.js";

describe("lumi addon SDK resolution", () => {
  let dir = "";
  let addonFile = "";

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "lumi-sdk-resolve-"));
    await ensureAddonLumiLink(dir);
    addonFile = path.join(dir, "index.ts");
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("resolves the top-level lumi specifier through the repo root exports", async () => {
    const resolved = await import.meta.resolve("lumi", addonFile);
    expect(resolved).toContain("packages/core/src/lib/addon-sandbox/sdk/index.ts");
  });

  it.each([
    "commands",
    "config",
    "discord",
    "interactions",
    "kv",
    "net",
    "permissions",
    "valkey",
    "scheduling",
    "ui",
    "utils",
  ])("resolves lumi/%s", async (subpath) => {
    const resolved = await import.meta.resolve(`lumi/${subpath}`, addonFile);
    expect(resolved).toContain(`addon-sandbox/sdk/${subpath}.ts`);
  });

  it.each([
    "@lumi/lib/env.js",
    "@lumi/lib/commands/gates.js",
    "@lumi/lib/valkey/client.js",
    "@lumi/lib/utilities/snowflakes.js",
    "@lumi/modules/mod/index.js",
    "#root/main.js",
  ])("refuses to resolve the internal specifier %s", (specifier) => {
    expect(() => import.meta.resolve(specifier, addonFile)).toThrow();
  });

  it("refuses a lumi subpath that is not in the map", () => {
    expect(() => import.meta.resolve("lumi/internals", addonFile)).toThrow();
  });

  it("exposes the module fundamentals from the top-level import", async () => {
    const sdk = await import("./index.js");
    expect(sdk.defineModule).toBeTypeOf("function");
    expect(sdk.cfg).toBeDefined();
  });

  it("exposes plain command definitions from lumi/commands", async () => {
    const commands = await import("./commands.js");
    expect(commands.defineCommand).toBeTypeOf("function");
    expect(commands.CommandContext).toBeTypeOf("function");
  });

  it("exposes card helpers from lumi/ui", async () => {
    const ui = await import("./ui.js");
    expect(ui.makeSuccessCard).toBeTypeOf("function");
    expect(ui.makeErrorCard).toBeTypeOf("function");
  });

  it("hands out no Discord client, database or Valkey handle", async () => {
    const sdk = await import("./index.js");
    const surface = Object.keys(sdk);
    expect(surface).not.toContain("container");
    expect(surface).not.toContain("Utility");
    expect(surface).not.toContain("getUtility");
    const utils = await import("./utils.js");
    expect(Object.keys(utils)).not.toContain("acquireValkeyLock");
  });
});

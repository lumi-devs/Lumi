import { describe, expect, test } from "bun:test";
import { parseManifest, safeParseManifest } from "../src/manifest.ts";

const valid = {
  apiVersion: 2,
  name: "afk",
  displayName: "AFK",
  description: "Set yourself AFK.",
  version: "1.2.3",
  entry: "./index.ts",
};

describe("module manifest", () => {
  test("fills optional defaults", () => {
    const manifest = parseManifest(valid);
    expect(manifest.apiVersion).toBe(2);
    expect(manifest.entry).toBe("./index.ts");
    expect(manifest.dependencies).toEqual({});
    expect(manifest.requirements).toEqual([]);
    expect(manifest.emoji).toBe("⚙️");
  });

  test("rejects names that are not safe directory names", () => {
    for (const name of ["../evil", "AFK", "-afk", "afk/bot"]) {
      const result = safeParseManifest({ ...valid, name });
      expect(result.ok).toBe(false);
    }
  });

  test("rejects entries that leave the module directory", () => {
    const result = safeParseManifest({ ...valid, entry: "../other/index.ts" });
    expect(result.ok).toBe(false);
  });

  test("requires an explicit api version and entry", () => {
    expect(safeParseManifest({ ...valid, apiVersion: undefined }).ok).toBe(false);
    expect(safeParseManifest({ ...valid, entry: undefined }).ok).toBe(false);
  });

  test("parses dependency ranges", () => {
    const manifest = parseManifest({ ...valid, dependencies: { core: "^1.0.0", economy: "~2.1.0" } });
    expect(manifest.dependencies).toEqual({ core: "^1.0.0", economy: "~2.1.0" });
  });

  test("rejects invalid versions and dependency ranges", () => {
    expect(safeParseManifest({ ...valid, version: "1.0.0.0" }).ok).toBe(false);
    expect(safeParseManifest({ ...valid, dependencies: { afk: "not-a-range" } }).ok).toBe(false);
  });

  test("returns readable issues", () => {
    const result = safeParseManifest({ ...valid, version: "not-a-version" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]).toContain("version");
  });
});

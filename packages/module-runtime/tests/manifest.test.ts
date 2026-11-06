import { describe, expect, it } from "vitest";
import {
  supermoduleManifestFields,
  validateManifest,
} from "../src/manifest.js";

const base = {
  apiVersion: 2,
  name: "utility-afk",
  displayName: "AFK",
  emoji: "💤",
  description: "Set AFK status",
  version: "2.0.0",
};

describe("validateManifest", () => {
  it("accepts a rudimentary supermodule manifest without an entry", () => {
    expect(validateManifest(base).entry).toBeUndefined();
  });

  it("accepts a submodule manifest with dependencies, conflicts, and capabilities", () => {
    const manifest = validateManifest({
      ...base,
      entry: "index.ts",
      dependencies: { utility: "^2.0.0" },
      requirements: ["lodash@^4.17.21"],
      conflicts: ["utility-afk-legacy"],
      capabilities: [
        {
          name: "utility-afk",
          version: "2.0.0",
          provides: ["utility.afk"],
        },
      ],
    });

    expect(manifest.dependencies).toEqual({ utility: "^2.0.0" });
    expect(manifest.conflicts).toEqual(["utility-afk-legacy"]);
    expect(manifest.capabilities[0]?.provides).toEqual(["utility.afk"]);
  });

  it("rejects malformed capabilities", () => {
    expect(() =>
      validateManifest({
        ...base,
        capabilities: [{ name: "utility-afk", version: "2.0.0" }],
      }),
    ).toThrow();
  });

  it("rejects unsafe config keys", () => {
    expect(() =>
      validateManifest({ ...base, configKey: "__proto__" }),
    ).toThrow();
    expect(() =>
      validateManifest({
        ...base,
        configFields: [{ key: "__proto__", label: "X", type: "string" }],
      }),
    ).toThrow();
  });

  it("rejects invalid dependency and conflict names", () => {
    expect(() =>
      validateManifest({ ...base, dependencies: { "../x": "^1.0.0" } }),
    ).toThrow();
    expect(() =>
      validateManifest({ ...base, conflicts: ["Bad Name"] }),
    ).toThrow();
  });

  it("rejects non-JS entry paths", () => {
    expect(() => validateManifest({ ...base, entry: "index.json" })).toThrow();
  });

  it("rejects unsafe entry paths", () => {
    expect(() =>
      validateManifest({ ...base, entry: "../outside.ts" }),
    ).toThrow();
  });

  it("reports non-thin supermodule manifest fields", () => {
    const manifest = validateManifest({
      ...base,
      entry: "index.ts",
      configKey: "afk",
      dependencies: { utility: "^2.0.0" },
      conflicts: ["legacy-afk"],
      capabilities: [
        { name: "utility-afk", version: "2.0.0", provides: ["utility.afk"] },
      ],
    });

    expect(supermoduleManifestFields(manifest)).toEqual([
      "entry",
      "configKey",
      "dependencies",
      "conflicts",
      "capabilities",
    ]);
    expect(supermoduleManifestFields(validateManifest(base))).toEqual([]);
  });
});

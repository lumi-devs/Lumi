import { describe, expect, it } from "vitest";
import { validateManifest } from "../src/manifest.js";

const base = {
  apiVersion: 2,
  name: "utility-afk",
  displayName: "AFK",
  emoji: "💤",
  description: "Set AFK status",
  version: "2.0.0",
  entry: "index.ts",
};

describe("validateManifest", () => {
  it("accepts a flat module manifest with an entry", () => {
    expect(validateManifest(base).entry).toBe("index.ts");
  });

  it("accepts an optional category", () => {
    expect(validateManifest({ ...base, category: "Utility" }).category).toBe(
      "Utility",
    );
    expect(validateManifest(base).category).toBeUndefined();
    expect(() => validateManifest({ ...base, category: "" })).toThrow();
    expect(() =>
      validateManifest({ ...base, category: "x".repeat(33) }),
    ).toThrow();
  });

  it("requires an entry", () => {
    const { entry: _entry, ...withoutEntry } = base;
    expect(() => validateManifest(withoutEntry)).toThrow();
  });

  it("accepts dependencies, conflicts, and capabilities", () => {
    const manifest = validateManifest({
      ...base,
      dependencies: { "utility-info": "^2.0.0" },
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

    expect(manifest.dependencies).toEqual({ "utility-info": "^2.0.0" });
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
});

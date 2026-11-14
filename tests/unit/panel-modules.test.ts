import type { ModuleSummary } from "@lumi/module-runtime";
import { describe, expect, it } from "vitest";
import { moduleItems } from "../../src/admin/panel/modules.ts";

function summary(
  name: string,
  overrides: Partial<ModuleSummary> = {},
): ModuleSummary {
  return {
    name,
    displayName: name,
    emoji: "x",
    description: `${name} description`,
    version: "1.0.0",
    configFields: [],
    origin: "bundled",
    ...overrides,
  };
}

const modules: ModuleSummary[] = [
  summary("afk", { displayName: "AFK", category: "Utility" }),
  summary("info", { displayName: "Info", category: "Utility" }),
  summary("antinuke", {
    displayName: "Anti-nuke",
    category: "Security",
  }),
  summary("addon-status", {
    displayName: "Status",
    category: "Utility",
    origin: "addon",
  }),
  summary("uncategorized", { displayName: "Uncategorized" }),
];

const enabled = new Set(["afk", "addon-status"]);
const isEnabled = (name: string) => enabled.has(name);

describe("moduleItems", () => {
  it("lists bundled modules grouped by category and excludes add-ons", () => {
    expect(moduleItems(modules, isEnabled)).toEqual([
      expect.objectContaining({
        name: "uncategorized",
        category: "Other",
        enabled: false,
      }),
      expect.objectContaining({
        name: "antinuke",
        category: "Security",
        enabled: false,
      }),
      expect.objectContaining({
        name: "afk",
        category: "Utility",
        enabled: true,
      }),
      expect.objectContaining({
        name: "info",
        category: "Utility",
        enabled: false,
      }),
    ]);
    expect(moduleItems(modules, isEnabled).map((item) => item.name)).not.toContain(
      "addon-status",
    );
  });

  it("falls back to Other when category is absent", () => {
    const [item] = moduleItems(
      [summary("no-category", { displayName: "No Category" })],
      () => false,
    );
    expect(item?.category).toBe("Other");
  });
});

import { describe, expect, it } from "vitest";
import type { ModuleSummary } from "@lumi/module-runtime";
import {
  moduleListRowId,
  parseSubmoduleTogglePages,
  submoduleItems,
  submodulePagePrefix,
  submoduleToggleId,
  supermoduleItems,
} from "../../src/admin/panel/modules.ts";

function summary(
  name: string,
  options: { submodule?: boolean; supermodule?: string } = {},
): ModuleSummary {
  return {
    name,
    displayName: name,
    emoji: "x",
    description: `${name} description`,
    version: "1.0.0",
    configFields: [],
    isSubmodule: options.submodule ?? false,
    supermodule: options.supermodule,
  };
}

const modules: ModuleSummary[] = [
  summary("utility"),
  summary("utility-afk", { submodule: true, supermodule: "utility" }),
  summary("utility-info", { submodule: true, supermodule: "utility" }),
  summary("security"),
  summary("security-antinuke", { submodule: true, supermodule: "security" }),
];

const enabled = new Set(["utility", "utility-afk"]);
const isEnabled = (name: string) => enabled.has(name);

describe("supermoduleItems", () => {
  it("lists only supermodules with submodule counts and enabled state", () => {
    expect(supermoduleItems(modules, isEnabled)).toEqual([
      expect.objectContaining({
        name: "utility",
        enabled: true,
        submoduleCount: 2,
      }),
      expect.objectContaining({
        name: "security",
        enabled: false,
        submoduleCount: 1,
      }),
    ]);
  });
});

describe("submoduleItems", () => {
  it("lists the children of one supermodule", () => {
    expect(submoduleItems(modules, "utility", isEnabled)).toEqual([
      expect.objectContaining({ name: "utility-afk", enabled: true }),
      expect.objectContaining({ name: "utility-info", enabled: false }),
    ]);
  });

  it("returns an empty list for unknown supermodules", () => {
    expect(submoduleItems(modules, "missing", isEnabled)).toEqual([]);
  });
});

describe("module panel ids", () => {
  it("points each supermodule row at its submodule view and page", () => {
    expect(moduleListRowId("utility", 2)).toBe("lumi:modsubs:utility:2");
  });

  it("keeps the origin page in the submodule pagination prefix", () => {
    expect(submodulePagePrefix("security", 3)).toBe(
      "lumi:modsubs:security:3",
    );
  });

  it("encodes the module and both pages in a submodule toggle id", () => {
    expect(submoduleToggleId("utility-afk", 2, 1)).toBe(
      "lumi:modsubtoggle:utility-afk:2.1",
    );
  });

  it("round-trips the pages from a submodule toggle payload", () => {
    expect(parseSubmoduleTogglePages("2.1")).toEqual({
      originPage: 2,
      childPage: 1,
    });
  });

  it("defaults invalid submodule toggle pages to zero", () => {
    expect(parseSubmoduleTogglePages("nope")).toEqual({
      originPage: 0,
      childPage: 0,
    });
  });
});

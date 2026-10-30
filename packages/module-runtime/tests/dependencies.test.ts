import { describe, expect, it } from "vitest";
import { checkDependencies } from "../src/loader.js";

const available = (versions: Record<string, string>) =>
  new Map(Object.entries(versions));

describe("checkDependencies", () => {
  it("accepts a satisfied semver range", () => {
    expect(
      checkDependencies(
        "utility-afk",
        { utility: "^2.0.0" },
        available({ utility: "2.3.1" }),
      ),
    ).toEqual([]);
  });

  it("reports an unsatisfied semver range", () => {
    expect(
      checkDependencies(
        "utility-afk",
        { utility: "^2.0.0" },
        available({ utility: "1.5.0" }),
      ),
    ).toEqual([
      {
        module: "utility-afk",
        dependency: "utility",
        reason: "unsatisfied",
        required: "^2.0.0",
        found: "1.5.0",
      },
    ]);
  });

  it("reports a missing dependency", () => {
    expect(
      checkDependencies("utility-afk", { utility: "^2.0.0" }, available({})),
    ).toEqual([
      { module: "utility-afk", dependency: "utility", reason: "missing" },
    ]);
  });
});

import { describe, it, expect } from "bun:test";
import { CoreVersion, LumiInfo } from "../../../src/lib/utilities/version.js";

describe("version", () => {
  it("LumiInfo returns valid version", () => {
    expect(LumiInfo.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(typeof LumiInfo.github).toBe("string");
  });

  it("CoreVersion matches the package version", () => {
    expect(CoreVersion).toBe(LumiInfo.version);
  });
});

import { describe, it, expect } from "bun:test";
import { LumiInfo } from "@utilities/Version.js";

describe("version", () => {
  it("LumiInfo returns valid version", () => {
    expect(LumiInfo.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(typeof LumiInfo.github).toBe("string");
  });
});

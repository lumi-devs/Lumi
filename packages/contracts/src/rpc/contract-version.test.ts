import { describe, expect, it } from "bun:test";
import { contractVersionsCompatible } from "./contract-version.js";

describe("contractVersionsCompatible", () => {
  it("accepts identical versions", () => {
    expect(contractVersionsCompatible("0.5.0", "0.5.0")).toBe(true);
  });

  it("accepts matching major.minor with a different patch once past 0.x", () => {
    expect(contractVersionsCompatible("1.4.0", "1.4.9")).toBe(true);
  });

  it("rejects a differing major", () => {
    expect(contractVersionsCompatible("1.0.0", "2.0.0")).toBe(false);
  });

  it("rejects a caller newer than the server", () => {
    expect(contractVersionsCompatible("0.5.0", "0.6.0")).toBe(false);
    expect(contractVersionsCompatible("0.7.0", "0.8.0")).toBe(false);
  });

  it("accepts backwards-compatible callers down to minSupportedVersion", () => {
    expect(contractVersionsCompatible("0.7.0", "0.6.0")).toBe(true);
    expect(contractVersionsCompatible("0.7.0", "0.7.0")).toBe(true);
    expect(contractVersionsCompatible("0.7.0", "0.5.0")).toBe(false);
  });

  it("accepts semver range strings matching the compatible range", () => {
    expect(contractVersionsCompatible("0.7.0", "^0.6.0")).toBe(true);
    expect(contractVersionsCompatible("0.7.0", ">=0.6.0 <=0.7.0")).toBe(true);
    expect(contractVersionsCompatible("0.7.0", "^0.8.0")).toBe(false);
  });

  it("ignores prerelease/build metadata suffixes", () => {
    expect(contractVersionsCompatible("0.5.0-next.0", "0.5.0-next.3")).toBe(true);
  });

  it("rejects an unparsable version on either side", () => {
    expect(contractVersionsCompatible("not-a-version", "0.5.0")).toBe(false);
    expect(contractVersionsCompatible("0.5.0", "not-a-version")).toBe(false);
  });
});

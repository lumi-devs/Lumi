import { describe, expect, it } from "vitest";
import { submoduleManifestName } from "../src/loader.js";

describe("submoduleManifestName", () => {
  it("namespaces the submodule under its supermodule", () => {
    expect(submoduleManifestName("utility", "afk")).toBe("utility-afk");
    expect(submoduleManifestName("security", "join-gate")).toBe(
      "security-join-gate",
    );
  });
});

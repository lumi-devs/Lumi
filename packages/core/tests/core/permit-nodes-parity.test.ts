import { describe, it, expect } from "bun:test";
import { KnownPermitNodes } from "@lumi/contracts";
import { KnownPermitNodesAutocomplete } from "#lib/permissions/permit-nodes.js";

describe("permit node parity (contracts <-> core)", () => {
  it("core autocomplete list matches the canonical contracts list", () => {
    expect([...KnownPermitNodesAutocomplete].sort()).toEqual(
      [...KnownPermitNodes].sort(),
    );
  });
});

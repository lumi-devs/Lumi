import { describe, it, expect } from "vitest";
import { KnownPermitNodes } from "@lumi/contracts";
import { KnownPermitNodeGroups } from "#/lib/permit-nodes";

describe("permit node parity (contracts <-> dashboard)", () => {
  it("dashboard picker covers exactly the canonical node list", () => {
    const dashboardNodes = KnownPermitNodeGroups.flatMap((group) =>
      group.nodes.map((n) => n.node),
    );
    expect([...dashboardNodes].sort()).toEqual([...KnownPermitNodes].sort());
  });
});

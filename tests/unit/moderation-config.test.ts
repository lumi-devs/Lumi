import { describe, expect, it } from "vitest";
import { getModerationConfig } from "../../modules/moderation/mod/config.ts";

function services(stored: unknown) {
  return {
    config: {
      get: async () => stored,
    },
  };
}

const RoleA = "111111111111111111";
const RoleB = "222222222222222222";

describe("getModerationConfig", () => {
  it("uses defaults when nothing is stored", async () => {
    await expect(
      getModerationConfig(services(undefined), "guild"),
    ).resolves.toEqual({
      quarantineRoleId: null,
      maxTargets: 10,
      immuneRoleIds: [],
      warnThresholds: {},
    });
  });

  it("clamps limits and filters invalid role IDs", async () => {
    const config = await getModerationConfig(
      services({
        quarantineRoleId: "not-a-role",
        maxTargets: 500,
        immuneRoleIds: [RoleA, RoleA, RoleB, "invalid"],
      }),
      "guild",
    );

    expect(config.quarantineRoleId).toBeNull();
    expect(config.maxTargets).toBe(100);
    expect(config.immuneRoleIds).toEqual([RoleA, RoleB]);
  });

  it("parses warn thresholds and normalizes timeout durations", async () => {
    const config = await getModerationConfig(
      services({
        warnThresholds: {
          "3": { action: "timeout", duration: 30 },
          "5": { action: "kick" },
          "7": { action: "ban", duration: 120 },
          "0": { action: "ban" },
          nope: { action: "kick" },
          "9": { action: "delete" },
        },
      }),
      "guild",
    );

    expect(config.warnThresholds).toEqual({
      "3": { action: "timeout", duration: 60 },
      "5": { action: "kick", duration: null },
      "7": { action: "ban", duration: null },
    });
  });
});

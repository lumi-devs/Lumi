import { describe, expect, it } from "vitest";
import { getLevelingConfig } from "../../modules/community/leveling/config.ts";

function services(stored: unknown) {
  return {
    config: {
      get: async () => stored,
    },
  };
}

const RoleA = "111111111111111111";
const RoleB = "222222222222222222";
const Channel = "333333333333333333";

describe("getLevelingConfig", () => {
  it("uses defaults when nothing is stored", async () => {
    await expect(
      getLevelingConfig(services(undefined), "guild"),
    ).resolves.toMatchObject({
      levelFormula: "disgaea",
      xpPerMessage: 15,
      cooldownSeconds: 60,
      roleRewards: [],
      multiplierRoles: [],
      channelMultipliers: [],
    });
  });

  it("falls back to the default formula for invalid stored values", async () => {
    const config = await getLevelingConfig(
      services({ levelFormula: "not-a-formula" }),
      "guild",
    );

    expect(config.levelFormula).toBe("disgaea");
  });

  it("clamps numeric settings and parses reward lists", async () => {
    const config = await getLevelingConfig(
      services({
        xpPerMessage: 0,
        cooldownSeconds: 99_999,
        minMessageLength: -5,
        voiceXpPerMinute: 0,
        globalMultiplier: 500,
        announceChannel: "not-a-channel",
        roleRewards: [
          { level: 5, roleId: RoleA },
          { level: 5, roleId: RoleB },
          { level: 0, roleId: RoleB },
          { level: 3, roleId: "invalid" },
        ],
        multiplierRoles: [
          { roleId: RoleA, multiplier: 2 },
          { roleId: RoleA, multiplier: 3 },
          { roleId: RoleB, multiplier: 0 },
        ],
        channelMultipliers: [
          { channelId: Channel, multiplier: 1.5 },
          { channelId: Channel, multiplier: 2 },
        ],
      }),
      "guild",
    );

    expect(config).toMatchObject({
      xpPerMessage: 1,
      cooldownSeconds: 3600,
      minMessageLength: 0,
      voiceXpPerMinute: 1,
      globalMultiplier: 100,
      announceChannel: null,
    });
    expect(config.roleRewards).toEqual([
      { level: 5, roleId: RoleA, removePrevious: false },
    ]);
    expect(config.multiplierRoles).toEqual([{ roleId: RoleA, multiplier: 2 }]);
    expect(config.channelMultipliers).toEqual([
      { channelId: Channel, multiplier: 1.5 },
    ]);
  });
});

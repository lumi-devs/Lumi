import { describe, expect, it } from "vitest";
import { parseTempVcGenerators } from "../../src/admin/panel/tempvc.ts";

const ChannelA = "111111111111111111";
const ChannelB = "222222222222222222";

describe("parseTempVcGenerators", () => {
  it("keeps valid generators and inherited defaults", () => {
    expect(parseTempVcGenerators([{ channelId: ChannelA }])).toEqual([
      { channelId: ChannelA },
    ]);
  });

  it("filters malformed entries and clamps optional fields", () => {
    expect(
      parseTempVcGenerators([
        null,
        "invalid",
        { channelId: "not-a-snowflake" },
        {
          channelId: ChannelB,
          templateName: `  ${"x".repeat(120)}  `,
          userLimit: 100,
        },
      ]),
    ).toEqual([{ channelId: ChannelB, templateName: "x".repeat(100) }]);
  });

  it("ignores non-array config", () => {
    expect(parseTempVcGenerators({ channelId: ChannelA })).toEqual([]);
  });
});

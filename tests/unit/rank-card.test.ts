import { describe, expect, it } from "vitest";
import { generateRankCard } from "../../modules/community/leveling/rankCard.ts";

const PngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe("generateRankCard", () => {
  it("renders a PNG and falls back when the avatar cannot load", async () => {
    const image = await generateRankCard({
      username: "Lumi",
      avatarUrl: "invalid://avatar",
      level: 12,
      xp: 40,
      xpToNext: 60,
      rank: 3,
      totalUsers: 25,
      guildName: "Test Server",
    });

    expect(image.subarray(0, 8)).toEqual(PngSignature);
  });

  it("renders max-level cards without dividing by zero", async () => {
    const image = await generateRankCard({
      username: "Lumi",
      avatarUrl: "invalid://avatar",
      level: 1000,
      xp: 0,
      xpToNext: 0,
      rank: 1,
      totalUsers: 1,
    });

    expect(image.subarray(0, 8)).toEqual(PngSignature);
  });
});

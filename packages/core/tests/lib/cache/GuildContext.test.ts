import { describe, it, expect, vi, beforeEach } from "bun:test";
import { getGuildContext } from "#lib/cache/GuildContext.js";
import { BrandColors } from "#lib/branding/colors.js";
import { container } from "@sapphire/framework";

describe("getGuildContext", () => {
  let getGuildSettings: any;
  let isGuildIgnored: any;
  let getModuleConfig: any;

  beforeEach(() => {
    getGuildSettings = vi.fn();
    isGuildIgnored = vi.fn();
    getModuleConfig = vi.fn();

    (container as any).db = {
      config: { getGuildSettings, getModuleConfig },
      access: { isGuildIgnored },
    };
  });

  it("composes locale, prefixes, ignoredGuild and brandColor from independently cached reads", async () => {
    getGuildSettings.mockResolvedValue({ locale: "en-US", prefix: "!" });
    isGuildIgnored.mockResolvedValue(false);
    getModuleConfig.mockResolvedValue(0x123456);

    const ctx = await getGuildContext("guild-1");

    expect(ctx).toEqual({
      locale: "en-US",
      prefixes: ["!"],
      ignoredGuild: false,
      brandColor: 0x123456,
    });
    expect(getGuildSettings).toHaveBeenCalledWith("guild-1");
    expect(isGuildIgnored).toHaveBeenCalledWith("guild-1");
    expect(getModuleConfig).toHaveBeenCalledWith("guild-1", "core", "brandColor");
  });

  it("falls back to no prefixes when the guild has no configured prefix", async () => {
    getGuildSettings.mockResolvedValue({ locale: "en-US", prefix: null });
    isGuildIgnored.mockResolvedValue(false);
    getModuleConfig.mockResolvedValue(null);

    const ctx = await getGuildContext("guild-2");

    expect(ctx.prefixes).toEqual([]);
  });

  it("falls back to BrandColors.primary when no brand color config is set", async () => {
    getGuildSettings.mockResolvedValue({ locale: "en-US", prefix: null });
    isGuildIgnored.mockResolvedValue(false);
    getModuleConfig.mockResolvedValue(null);

    const ctx = await getGuildContext("guild-3");

    expect(ctx.brandColor).toBe(BrandColors.primary);
  });

  it("passes through whatever locale getGuildSettings returns, including an empty one", async () => {
    getGuildSettings.mockResolvedValue({ locale: "", prefix: null });
    isGuildIgnored.mockResolvedValue(true);
    getModuleConfig.mockResolvedValue(null);

    const ctx = await getGuildContext("guild-4");

    expect(ctx.locale).toBe("");
    expect(ctx.ignoredGuild).toBe(true);
  });
});

import { describe, it, expect, vi } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import {
  isChannelLocked,
  lockChannel,
  unlockChannel,
} from "#lib/moderation/lockdown.js";

function makeChannel(denied: boolean) {
  const overwrite = denied
    ? { deny: { has: () => true } }
    : undefined;
  const edit = vi.fn().mockResolvedValue(undefined);
  return {
    guild: { id: "guild-1" },
    permissionOverwrites: {
      cache: { get: () => overwrite },
      edit,
    },
    edit,
  };
}

describe("channel lock helpers", () => {
  it("reports unlocked when there is no @everyone deny overwrite", () => {
    const channel = makeChannel(false);
    expect(isChannelLocked(channel as any)).toBe(false);
  });

  it("reports locked when @everyone denies SendMessages", () => {
    const channel = makeChannel(true);
    expect(isChannelLocked(channel as any)).toBe(true);
  });

  it("lockChannel denies SendMessages for @everyone with a reason", async () => {
    const channel = makeChannel(false);
    await lockChannel(channel as any, "test reason");
    expect(channel.permissionOverwrites.edit).toHaveBeenCalledWith(
      "guild-1",
      { SendMessages: false },
      { reason: "test reason" },
    );
  });

  it("unlockChannel clears the SendMessages overwrite", async () => {
    const channel = makeChannel(true);
    await unlockChannel(channel as any, "test reason");
    expect(channel.permissionOverwrites.edit).toHaveBeenCalledWith(
      "guild-1",
      { SendMessages: null },
      { reason: "test reason" },
    );
  });

  it("PermissionFlagsBits.SendMessages is a stable bit used for the deny check", () => {
    expect(typeof PermissionFlagsBits.SendMessages).toBe("bigint");
  });
});

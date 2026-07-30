import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { SoftbanAction } from "#modules/mod/actions/SoftbanAction.js";

vi.mock("@sapphire/framework", () => ({
  container: {
    db: {
      moderation: {
        createModerationCase: vi.fn(),
      },
    },
    client: {
      channels: {
        cache: {
          get: vi.fn(),
        },
      },
    },
  },
}));

vi.mock("#modules/mod/lib/helpers.js", () => ({
  logToChannel: vi.fn(),
}));

describe("SoftbanAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("SoftbanAction.apply sends DM, bans user, removes ban, creates case, and logs to channel", async () => {
    const mockUser = { id: "u-1", send: vi.fn().mockResolvedValue({}) };
    const mockMod = { id: "m-1", tag: "Mod#0001" };
    const mockGuild = {
      id: "g-1",
      name: "TestGuild",
      members: { ban: vi.fn().mockResolvedValue({}) },
      bans: { remove: vi.fn().mockResolvedValue({}) },
    };
    (container.db.moderation.createModerationCase as any).mockResolvedValue({
      caseNumber: 42,
    });

    const c = await SoftbanAction.apply({
      guild: mockGuild as any,
      targetUser: mockUser as any,
      moderator: mockMod as any,
      reason: "Rule breach",
      deleteMessageDays: 2,
    });

    expect(c.caseNumber).toBe(42);
    expect(mockUser.send).toHaveBeenCalled();
    expect(mockGuild.members.ban).toHaveBeenCalledWith(
      "u-1",
      expect.objectContaining({ deleteMessageSeconds: 172800 }),
    );
    expect(mockGuild.bans.remove).toHaveBeenCalledWith(
      "u-1",
      expect.anything(),
    );
  });
});

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
  logToChannel: vi.fn().mockResolvedValue(undefined),
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

  it("SoftbanAction.apply formats the audit reason and reuses it for the unban", async () => {
    const banSpy = vi.fn().mockResolvedValue({});
    const unbanSpy = vi.fn().mockResolvedValue({});
    const sendSpy = vi.fn().mockResolvedValue({});

    const mockGuild = {
      id: "g-100",
      name: "Test Guild",
      members: { ban: banSpy },
      bans: { remove: unbanSpy },
    };

    const mockTarget = { id: "user-200", tag: "Target#0001", send: sendSpy };
    const mockModerator = { id: "mod-300", tag: "Moderator#0001" };

    (container.db.moderation.createModerationCase as any).mockResolvedValue({
      caseNumber: 42,
    });

    const caseResult = await SoftbanAction.apply({
      guild: mockGuild as any,
      targetUser: mockTarget as any,
      moderator: mockModerator as any,
      reason: "Spamming links",
      deleteMessageDays: 2,
    });

    expect(sendSpy).toHaveBeenCalled();
    expect(banSpy).toHaveBeenCalledWith("user-200", {
      reason: "[Moderator#0001 | mod-300] [Softban] Spamming links",
      deleteMessageSeconds: 2 * 86400,
    });
    expect(unbanSpy).toHaveBeenCalledWith(
      "user-200",
      "[Moderator#0001 | mod-300] [Softban] Spamming links",
    );
    expect(container.db.moderation.createModerationCase).toHaveBeenCalledWith({
      guildId: "g-100",
      userId: "user-200",
      moderatorId: "mod-300",
      action: "softban",
      reason: "Spamming links",
    });
    expect(caseResult).toEqual({ caseNumber: 42 });
  });
});

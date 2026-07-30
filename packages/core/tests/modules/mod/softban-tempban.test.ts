import { describe, it, expect, vi, beforeEach } from "vitest";
import { SoftbanAction } from "../../../src/modules/mod/actions/SoftbanAction.js";
import { BanAction } from "../../../src/modules/mod/actions/BanAction.js";
import { container } from "@sapphire/framework";

vi.mock("../../../src/modules/mod/lib/helpers.js", () => ({
  logToChannel: vi.fn().mockResolvedValue(undefined),
}));

describe("Softban & Tempban Action Test Suite", () => {
  beforeEach(() => {
    container.db = {
      moderation: {
        createModerationCase: vi.fn().mockResolvedValue({ caseNumber: 42 }),
        getActiveCases: vi.fn().mockResolvedValue([]),
        getModerationCases: vi.fn().mockResolvedValue([]),
      },
      config: {
        getModuleConfig: vi.fn().mockResolvedValue(null),
      },
    } as any;
  });

  it("SoftbanAction applies ban and immediate unban with message deletion", async () => {
    const banSpy = vi.fn().mockResolvedValue({});
    const unbanSpy = vi.fn().mockResolvedValue({});
    const sendSpy = vi.fn().mockResolvedValue({});

    const mockGuild = {
      id: "g-100",
      name: "Test Guild",
      members: {
        ban: banSpy,
      },
      bans: {
        remove: unbanSpy,
      },
    } as any;

    const mockTarget = {
      id: "user-200",
      tag: "Target#0001",
      send: sendSpy,
    } as any;

    const mockModerator = {
      id: "mod-300",
      tag: "Moderator#0001",
    } as any;

    const caseResult = await SoftbanAction.apply({
      guild: mockGuild,
      targetUser: mockTarget,
      moderator: mockModerator,
      reason: "Spamming links",
      deleteMessageDays: 2,
    });

    expect(sendSpy).toHaveBeenCalled();
    expect(banSpy).toHaveBeenCalledWith("user-200", {
      reason: "[Moderator#0001 | mod-300] [Softban] Spamming links",
      deleteMessageSeconds: 2 * 86400,
    });
    expect(unbanSpy).toHaveBeenCalledWith("user-200", "[Moderator#0001 | mod-300] [Softban] Spamming links");
    expect(container.db.moderation.createModerationCase).toHaveBeenCalledWith({
      guildId: "g-100",
      userId: "user-200",
      moderatorId: "mod-300",
      action: "softban",
      reason: "Spamming links",
    });
    expect(caseResult).toEqual({ caseNumber: 42 });
  });

  it("BanAction supports temporary bans and creates moderation case", async () => {
    const banSpy = vi.fn().mockResolvedValue({});
    const sendSpy = vi.fn().mockResolvedValue({});

    const mockGuild = {
      id: "g-100",
      name: "Test Guild",
      members: {
        ban: banSpy,
      },
    } as any;

    const mockTarget = {
      id: "user-200",
      tag: "Target#0001",
      send: sendSpy,
    } as any;

    const mockModerator = {
      id: "mod-300",
      tag: "Moderator#0001",
    } as any;

    const caseResult = await BanAction.apply({
      guild: mockGuild,
      targetUser: mockTarget,
      moderator: mockModerator,
      reason: "Rule violations",
      deleteMessageSeconds: 86400,
    });

    expect(sendSpy).toHaveBeenCalled();
    expect(banSpy).toHaveBeenCalledWith("user-200", {
      reason: "[Moderator#0001 | mod-300] Rule violations",
      deleteMessageSeconds: 86400,
    });
    expect(container.db.moderation.createModerationCase).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: "g-100",
        userId: "user-200",
        moderatorId: "mod-300",
        action: "ban",
        reason: "Rule violations",
      }),
    );
    expect(caseResult).toEqual({ caseNumber: 42 });
  });
});

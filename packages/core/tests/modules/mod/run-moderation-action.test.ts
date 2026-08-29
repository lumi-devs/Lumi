import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { runModerationAction } from "#modules/mod/lib/runModerationAction.js";

vi.mock("@sapphire/framework", () => ({
  container: {
    logger: {
      warn: vi.fn(),
    },
  },
}));

vi.mock("#modules/mod/lib/helpers.js", () => ({
  logToChannel: vi.fn(),
  scheduleCaseLift: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("#lib/appeals/dm.js", () => ({
  sendAppealLinkDm: vi.fn().mockResolvedValue(undefined),
}));

import { logToChannel, scheduleCaseLift } from "#modules/mod/lib/helpers.js";
import { sendAppealLinkDm } from "#lib/appeals/dm.js";

describe("runModerationAction", () => {
  const mockCase: any = { id: 1, caseNumber: 5, expiresAt: null };

  beforeEach(() => {
    vi.clearAllMocks();
    (logToChannel as any).mockResolvedValue(undefined);
  });

  it("returns the case from perform() when every best-effort step succeeds", async () => {
    const result = await runModerationAction({
      perform: async () => mockCase,
      log: (c) => ({
        guildId: "g-1",
        label: "Test",
        color: 0,
        targetId: "u-1",
        moderator: { id: "m-1" } as any,
        reason: "reason",
        caseNumber: c.caseNumber,
      }),
    });

    expect(result).toBe(mockCase);
    expect(logToChannel).toHaveBeenCalledWith(
      "g-1",
      "Test",
      0,
      "u-1",
      { id: "m-1" },
      "reason",
      5,
      undefined,
    );
  });

  it("still returns the case when logToChannel rejects", async () => {
    (logToChannel as any).mockRejectedValue(new Error("log channel down"));

    const result = await runModerationAction({
      perform: async () => mockCase,
      log: (c) => ({
        guildId: "g-1",
        label: "Test",
        color: 0,
        targetId: "u-1",
        moderator: { id: "m-1" } as any,
        reason: "reason",
        caseNumber: c.caseNumber,
      }),
    });

    expect(result).toBe(mockCase);
    expect(container.logger.warn).toHaveBeenCalled();
  });

  it("propagates a failure from perform() without running the tail steps", async () => {
    await expect(
      runModerationAction({
        perform: async () => {
          throw new Error("case write failed");
        },
        log: () => ({
          guildId: "g-1",
          label: "Test",
          color: 0,
          targetId: "u-1",
          moderator: { id: "m-1" } as any,
          reason: "reason",
          caseNumber: 1,
        }),
      }),
    ).rejects.toThrow("case write failed");

    expect(logToChannel).not.toHaveBeenCalled();
    expect(scheduleCaseLift).not.toHaveBeenCalled();
  });

  it("schedules the lift job and sends the appeal DM when requested", async () => {
    await runModerationAction({
      perform: async () => mockCase,
      scheduleLift: true,
      log: (c) => ({
        guildId: "g-1",
        label: "Test",
        color: 0,
        targetId: "u-1",
        moderator: { id: "m-1" } as any,
        reason: "reason",
        caseNumber: c.caseNumber,
      }),
      appealDm: () => ({ targetUser: { id: "u-1" } as any, guild: { id: "g-1" } as any }),
    });

    expect(scheduleCaseLift).toHaveBeenCalledWith(container, mockCase);
    expect(sendAppealLinkDm).toHaveBeenCalledWith(
      { id: "u-1" },
      { id: "g-1" },
      mockCase,
    );
  });
});

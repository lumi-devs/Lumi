import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  formatAuditReason,
  LumiInfo,
  fmtId,
  isModuleEnabled,
  canSendMessages,
  withSerializedWork,
} from "#lib/utilities/misc.js";
import { instrumentCommandPiece } from "#lib/telemetry/instrument.js";
import * as moduleCheck from "#lib/module-check.js";
import * as observability from "@lumi/observability";

vi.mock("@sapphire/discord.js-utilities", () => ({
  isGuildBasedChannel: vi.fn().mockImplementation((ch: any) => ch?.isGuildBased?.() ?? false),
}));

vi.mock("@lumi/observability", () => {
  return {
    commandDuration: {
      startTimer: vi.fn().mockReturnValue(vi.fn()),
    },
    commandsTotal: {
      inc: vi.fn(),
    },
    runWithContext: vi.fn().mockImplementation((_ctx, fn) => fn()),
    withSpan: vi.fn().mockImplementation((_name, fn) => {
      const mockSpan = { setAttribute: vi.fn() };
      return fn(mockSpan);
    }),
  };
});

describe("misc utilities & telemetry instrumentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("misc utilities", () => {
    it("formatAuditReason formats actor tag, id, and reason with maxLen truncation", () => {
      const actor = { tag: "Admin#1234", id: "100200300" } as any;

      expect(formatAuditReason(actor, "Spamming")).toBe("[Admin#1234 | 100200300] Spamming");
      expect(formatAuditReason(actor, null)).toBe("[Admin#1234 | 100200300] No reason provided.");

      const longReason = "a".repeat(600);
      const formatted = formatAuditReason(actor, longReason, 50);
      expect(formatted).toHaveLength(50);
      expect(formatted).toBe("[Admin#1234 | 100200300] aaaaaaaaaaaaaaaaaaaaaaaaa");
    });

    it("LumiInfo returns age in days", () => {
      expect(LumiInfo.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(typeof LumiInfo.getAgeInDays()).toBe("number");
      expect(LumiInfo.getAgeInDays()).toBeGreaterThanOrEqual(0);
    });

    it("fmtId converts id to string or returns 'unknown'", () => {
      expect(fmtId("12345")).toBe("12345");
      expect(fmtId(999)).toBe("999");
      expect(fmtId(null)).toBe("unknown");
      expect(fmtId(undefined)).toBe("unknown");
    });

    it("isModuleEnabled delegates to checkModulesEnabled", async () => {
      vi.spyOn(moduleCheck, "checkModulesEnabled").mockResolvedValue(
        new Map([["afk", true]])
      );

      const res = await isModuleEnabled("g-1", "afk");
      expect(res).toBe(true);
      expect(moduleCheck.checkModulesEnabled).toHaveBeenCalledWith("g-1", ["afk"]);
    });

    it("canSendMessages checks permissions for bot member in guild channel", () => {
      const mockMessage = {
        channel: {
          isGuildBased: () => true,
          permissionsFor: vi.fn().mockReturnValue({
            has: vi.fn().mockReturnValue(true),
          }),
        },
        guild: {
          members: {
            me: { id: "bot-id" },
          },
        },
      } as any;

      expect(canSendMessages(mockMessage)).toBe(true);

      // Channel missing permissions
      mockMessage.channel.permissionsFor.mockReturnValue(null);
      expect(canSendMessages(mockMessage)).toBe(false);

      // Non-guild channel
      const nonGuildMsg = {
        channel: { isGuildBased: () => false },
      } as any;
      expect(canSendMessages(nonGuildMsg)).toBe(false);
    });

    it("withSerializedWork serializes async work behind a key", async () => {
      const order: number[] = [];

      const task1 = withSerializedWork("key-1", async () => {
        await new Promise((r) => setTimeout(r, 50));
        order.push(1);
        return "res-1";
      });

      const task2 = withSerializedWork("key-1", () => {
        order.push(2);
        return Promise.resolve("res-2");
      });

      const [r1, r2] = await Promise.all([task1, task2]);

      expect(r1).toBe("res-1");
      expect(r2).toBe("res-2");
      expect(order).toEqual([1, 2]);
    });
  });

  describe("instrumentCommandPiece", () => {
    it("wraps chatInputRun, messageRun, and contextMenuRun with telemetry", async () => {
      const piece = {
        name: "test-command",
        chatInputRun: vi.fn().mockResolvedValue("chat-ok"),
        messageRun: vi.fn().mockRejectedValue(new Error("msg-fail")),
      };

      instrumentCommandPiece(piece);

      // Test chatInputRun success
      const chatRes = await piece.chatInputRun({ guildId: "g-1", user: { id: "u-1" } });
      expect(chatRes).toBe("chat-ok");
      expect(observability.commandsTotal.inc).toHaveBeenCalledWith({
        command: "test-command",
        type: "chat",
        status: "success",
      });

      // Test messageRun error
      await expect(piece.messageRun({ guild: { id: "g-2" }, author: { id: "u-2" } })).rejects.toThrow("msg-fail");
      expect(observability.commandsTotal.inc).toHaveBeenCalledWith({
        command: "test-command",
        type: "message",
        status: "error",
      });
    });
  });
});

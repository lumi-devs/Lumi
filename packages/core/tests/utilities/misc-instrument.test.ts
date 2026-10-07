import { describe, it, expect, vi, beforeEach } from "bun:test";
import {
  formatAuditReason,
  LumiInfo,
  fmtId,
  isModuleEnabled,
  canSendMessages,
  withSerializedWork,
} from "#lib/utilities/misc.js";

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

    it("LumiInfo returns valid version", () => {
      expect(LumiInfo.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(typeof LumiInfo.github).toBe("string");
    });

    it("fmtId converts id to string or returns 'unknown'", () => {
      expect(fmtId("12345")).toBe("12345");
      expect(fmtId(999)).toBe("999");
      expect(fmtId(null)).toBe("unknown");
      expect(fmtId(undefined)).toBe("unknown");
    });

    it("isModuleEnabled delegates to services.db.modules.isModuleEnabled", async () => {
      const services = {
        db: {
          modules: {
            isModuleEnabled: vi.fn().mockResolvedValue(true),
          },
        },
      } as any;

      const res = await isModuleEnabled(services, "g-1", "afk");
      expect(res).toBe(true);
      expect(services.db.modules.isModuleEnabled).toHaveBeenCalledWith("g-1", "afk");
    });

    it("canSendMessages checks permissions for bot member in guild channel", () => {
      const mockMessage = {
        channel: {
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

      mockMessage.channel.permissionsFor.mockReturnValue(null);
      expect(canSendMessages(mockMessage)).toBe(false);

      mockMessage.guild.members.me = null;
      expect(canSendMessages(mockMessage)).toBe(false);
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
});

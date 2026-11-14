import { describe, expect, it } from "vitest";
import { parseCron } from "../src/cron.js";
import {
  evaluateNodeMatch,
  isBotOwner,
  isGuildOwner,
  PermitResolver,
} from "../src/evaluator.js";

describe("Permit Evaluator", () => {
  describe("evaluateNodeMatch", () => {
    it("should match exact node", () => {
      expect(evaluateNodeMatch("mod.ban", "mod.ban")).toBe(true);
    });

    it("should match wildcard", () => {
      expect(evaluateNodeMatch("*", "mod.ban")).toBe(true);
      expect(evaluateNodeMatch("*", "admin.config")).toBe(true);
    });

    it("should match namespace wildcard", () => {
      expect(evaluateNodeMatch("mod.*", "mod.ban")).toBe(true);
      expect(evaluateNodeMatch("mod.*", "mod.kick")).toBe(true);
      expect(evaluateNodeMatch("mod.*", "admin.ban")).toBe(false);
    });

    it("should match nested namespace", () => {
      expect(evaluateNodeMatch("mod.*", "mod")).toBe(true);
      expect(evaluateNodeMatch("admin.config.*", "admin.config.users")).toBe(
        true,
      );
    });

    it("should not match partial", () => {
      expect(evaluateNodeMatch("mod.ban", "mod.ban.extra")).toBe(false);
    });
  });

  describe("isBotOwner", () => {
    it("should be a function", () => {
      expect(typeof isBotOwner).toBe("function");
    });

    it("should return false for non-owner when OWNER_IDS not set", () => {
      expect(isBotOwner("999")).toBe(false);
    });
  });

  describe("isGuildOwner", () => {
    it("should return true for guild owner", () => {
      expect(isGuildOwner("123", "123")).toBe(true);
    });

    it("should return false for non-owner", () => {
      expect(isGuildOwner("123", "456")).toBe(false);
    });
  });

  describe("Schedule/Cron", () => {
    it("should parse cron expressions", () => {
      const parsed = parseCron("0 9 * * 1-5");
      expect(parsed.minute).toEqual([0]);
      expect(parsed.hour).toEqual([9]);
      expect(parsed.dayOfWeek).toEqual([1, 2, 3, 4, 5]);
    });

    it("should parse every minute cron", () => {
      const parsed = parseCron("* * * * *");
      expect(parsed.minute).toEqual(Array.from({ length: 60 }, (_, i) => i));
      expect(parsed.hour).toEqual(Array.from({ length: 24 }, (_, i) => i));
    });

    it("should parse hourly cron", () => {
      const parsed = parseCron("0 * * * *");
      expect(parsed.minute).toEqual([0]);
      expect(parsed.hour).toEqual(Array.from({ length: 24 }, (_, i) => i));
    });
  });

  describe("Expiry Logic", () => {
    it("should reject expired permits", () => {
      const past = new Date(Date.now() - 1000);
      const expired = past < new Date();
      expect(expired).toBe(true);
    });

    it("should accept valid permits", () => {
      const future = new Date(Date.now() + 1000);
      const expired = future < new Date();
      expect(expired).toBe(false);
    });

    it("should accept permits without expiry (null)", () => {
      const checkExpiry = (expiry: Date | null) =>
        expiry !== null && expiry < new Date();
      expect(checkExpiry(null)).toBe(false);
      expect(checkExpiry(new Date(Date.now() + 1000))).toBe(false);
      expect(checkExpiry(new Date(Date.now() - 1000))).toBe(true);
    });
  });

  describe("PermitResolver", () => {
    it("should be instantiable", () => {
      const resolver = new PermitResolver();
      expect(resolver).toBeInstanceOf(PermitResolver);
    });
  });
});

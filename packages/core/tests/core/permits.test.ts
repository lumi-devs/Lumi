import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PermitResolver,
  evaluateNodeMatch,
} from "#lib/permissions/PermitResolver.js";
import { container } from "@sapphire/framework";

describe("PermitResolver & Anti-Nuke Quarantine Interceptor", () => {
  let resolver: PermitResolver;

  beforeEach(() => {
    vi.resetAllMocks();
    resolver = new PermitResolver();
  });

  describe("evaluateNodeMatch", () => {
    it("should match exact node names", () => {
      expect(evaluateNodeMatch("mod.ban", "mod.ban")).toBe(true);
      expect(evaluateNodeMatch("mod.ban", "mod.kick")).toBe(false);
    });

    it("should match global wildcard *", () => {
      expect(evaluateNodeMatch("*", "mod.ban")).toBe(true);
      expect(evaluateNodeMatch("*", "config.prefix")).toBe(true);
    });

    it("should match section wildcards like mod.*", () => {
      expect(evaluateNodeMatch("mod.*", "mod.ban")).toBe(true);
      expect(evaluateNodeMatch("mod.*", "mod.kick.soft")).toBe(true);
      expect(evaluateNodeMatch("mod.*", "config.prefix")).toBe(false);
    });
  });

  describe("hasPermit evaluation pipeline", () => {
    it("should grant permission for Guild Owner", async () => {
      const allowed = await resolver.hasPermit({
        guildId: "G1",
        userId: "OWNER",
        permitNode: "mod.ban",
        guildOwnerId: "OWNER",
      });
      expect(allowed).toBe(true);
    });

    it("should evaluate Custom Permits when not quarantined", async () => {
      (container as any).db = {
        getUserPermits: vi.fn().mockResolvedValue({
          customPermits: new Set(["mod.warn"]),
          enforcedPermits: new Set(),
          isQuarantined: false,
        }),
      };

      const allowedWarn = await resolver.hasPermit({
        guildId: "G1",
        userId: "U1",
        permitNode: "mod.warn",
      });
      expect(allowedWarn).toBe(true);

      const allowedBan = await resolver.hasPermit({
        guildId: "G1",
        userId: "U1",
        permitNode: "mod.ban",
      });
      expect(allowedBan).toBe(false);
    });

    it("should STRIP Custom Permits when Anti-Nuke Quarantine is active", async () => {
      (container as any).db = {
        getUserPermits: vi.fn().mockResolvedValue({
          customPermits: new Set(), // Interceptor strips custom permits when quarantined
          enforcedPermits: new Set(),
          isQuarantined: true,
        }),
      };

      const allowedWarn = await resolver.hasPermit({
        guildId: "G1",
        userId: "U1",
        permitNode: "mod.warn",
      });
      expect(allowedWarn).toBe(false);
    });

    it("should PRESERVE Enforced Permits even when Anti-Nuke Quarantine is active", async () => {
      (container as any).db = {
        getUserPermits: vi.fn().mockResolvedValue({
          customPermits: new Set(), // Stripped
          enforcedPermits: new Set(["system.emergency"]), // Retained
          isQuarantined: true,
        }),
      };

      const allowedEmergency = await resolver.hasPermit({
        guildId: "G1",
        userId: "U1",
        permitNode: "system.emergency",
      });
      expect(allowedEmergency).toBe(true);

      const allowedCustom = await resolver.hasPermit({
        guildId: "G1",
        userId: "U1",
        permitNode: "mod.warn",
      });
      expect(allowedCustom).toBe(false);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PermitResolver,
  evaluateNodeMatch,
} from "#lib/permissions/PermitResolver.js";
import { container, UserError } from "@sapphire/framework";

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

    it("should match section wildcards like mod.* and nested wildcards like mod.kick.*", () => {
      expect(evaluateNodeMatch("mod.*", "mod.ban")).toBe(true);
      expect(evaluateNodeMatch("mod.*", "mod.kick.soft")).toBe(true);
      expect(evaluateNodeMatch("mod.*", "config.prefix")).toBe(false);
      expect(evaluateNodeMatch("mod.kick.*", "mod.kick.soft")).toBe(true);
      expect(evaluateNodeMatch("mod.kick.*", "mod.kick")).toBe(true);
      expect(evaluateNodeMatch("mod.kick.*", "mod.ban")).toBe(false);
    });

    it("should evaluate evaluateNodeMatch instance method", () => {
      expect(resolver.evaluateNodeMatch("mod.*", "mod.ban")).toBe(true);
    });
  });

  describe("isBotOwner", () => {
    it("should return true if user is client application single owner", () => {
      (container as any).client = {
        application: {
          owner: { id: "APP_OWNER" },
        },
      };
      expect(PermitResolver.isBotOwner("APP_OWNER")).toBe(true);
      expect(PermitResolver.isBotOwner("OTHER_USER")).toBe(false);
    });

    it("should return true if user is in team application members", () => {
      (container as any).client = {
        application: {
          owner: {
            members: new Set(["TEAM_MEMBER_1", "TEAM_MEMBER_2"]),
          },
        },
      };
      expect(PermitResolver.isBotOwner("TEAM_MEMBER_1")).toBe(true);
      expect(PermitResolver.isBotOwner("NON_MEMBER")).toBe(false);
    });
  });

  describe("isGuildOwner", () => {
    it("should return true when userId matches guildOwnerId", () => {
      expect(PermitResolver.isGuildOwner("123", "123")).toBe(true);
    });

    it("should return false when userId does not match guildOwnerId", () => {
      expect(PermitResolver.isGuildOwner("123", "456")).toBe(false);
    });

    it("should return false when guildOwnerId is null", () => {
      expect(PermitResolver.isGuildOwner(null, "123")).toBe(false);
    });
  });

  describe("resolveUserPermits", () => {
    it("should pass guildId, userId and roleIds through to container.db.getUserPermits", async () => {
      const getUserPermits = vi.fn().mockResolvedValue({
        customPermits: new Set(),
        enforcedPermits: new Set(),
        isQuarantined: false,
      });
      (container as any).db = { getUserPermits };

      await resolver.resolveUserPermits("G1", "U1", ["ROLE1", "ROLE2"]);

      expect(getUserPermits).toHaveBeenCalledWith("G1", "U1", ["ROLE1", "ROLE2"]);
    });
  });

  describe("hasPermit & assertPermit evaluation pipeline", () => {
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
          customPermits: new Set(),
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
          customPermits: new Set(),
          enforcedPermits: new Set(["system.emergency"]),
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

    it("should throw UserError on assertPermit when permission is denied", async () => {
      (container as any).db = {
        getUserPermits: vi.fn().mockResolvedValue({
          customPermits: new Set(),
          enforcedPermits: new Set(),
          isQuarantined: false,
        }),
      };

      await expect(
        resolver.assertPermit({
          guildId: "G1",
          userId: "U1",
          permitNode: "mod.ban",
        }),
      ).rejects.toThrow(UserError);
    });

    it("should resolve assertPermit when permission is granted", async () => {
      (container as any).db = {
        getUserPermits: vi.fn().mockResolvedValue({
          customPermits: new Set(["mod.ban"]),
          enforcedPermits: new Set(),
          isQuarantined: false,
        }),
      };

      await expect(
        resolver.assertPermit({
          guildId: "G1",
          userId: "U1",
          permitNode: "mod.ban",
        }),
      ).resolves.toBeUndefined();
    });
  });
});

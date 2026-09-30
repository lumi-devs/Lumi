import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import { PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { authorize } from "#lib/permissions/authorize.js";
import { PermitResolver } from "#lib/permissions/PermitResolver.js";

describe("authorize", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("botOwner", () => {
    it("delegates to PermitResolver.isBotOwner for the actor's userId", async () => {
      const spy = vi.spyOn(PermitResolver, "isBotOwner").mockReturnValue(true);

      await expect(authorize({ userId: "U1" }, { kind: "botOwner" })).resolves.toBe(true);
      expect(spy).toHaveBeenCalledWith("U1");
    });

    it("denies when PermitResolver.isBotOwner says no", async () => {
      vi.spyOn(PermitResolver, "isBotOwner").mockReturnValue(false);

      await expect(authorize({ userId: "U1" }, { kind: "botOwner" })).resolves.toBe(false);
    });
  });

  describe("guildOwner", () => {
    it("grants the guild's owner", async () => {
      await expect(
        authorize({ userId: "U1", guildOwnerId: "U1" }, { kind: "guildOwner" }),
      ).resolves.toBe(true);
    });

    it("denies anyone else", async () => {
      await expect(
        authorize({ userId: "U1", guildOwnerId: "U2" }, { kind: "guildOwner" }),
      ).resolves.toBe(false);
    });

    it("denies when there is no guild owner to compare against", async () => {
      await expect(
        authorize({ userId: "U1", guildOwnerId: null }, { kind: "guildOwner" }),
      ).resolves.toBe(false);
    });
  });

  describe("guildManager", () => {
    it("grants a bitfield holding ManageGuild", async () => {
      const bits = new PermissionsBitField(PermissionFlagsBits.ManageGuild);
      await expect(
        authorize({ userId: "U1", memberPermissions: bits }, { kind: "guildManager" }),
      ).resolves.toBe(true);
    });

    it("grants a bitfield holding Administrator", async () => {
      const bits = new PermissionsBitField(PermissionFlagsBits.Administrator);
      await expect(
        authorize({ userId: "U1", memberPermissions: bits }, { kind: "guildManager" }),
      ).resolves.toBe(true);
    });

    it("accepts a raw bigint bitfield, not just a PermissionsBitField instance", async () => {
      await expect(
        authorize(
          { userId: "U1", memberPermissions: PermissionFlagsBits.ManageGuild },
          { kind: "guildManager" },
        ),
      ).resolves.toBe(true);
    });

    it("denies a bitfield holding neither permission", async () => {
      const bits = new PermissionsBitField(PermissionFlagsBits.SendMessages);
      await expect(
        authorize({ userId: "U1", memberPermissions: bits }, { kind: "guildManager" }),
      ).resolves.toBe(false);
    });

    it("denies when no permissions are known at all", async () => {
      await expect(
        authorize({ userId: "U1" }, { kind: "guildManager" }),
      ).resolves.toBe(false);
      await expect(
        authorize({ userId: "U1", memberPermissions: null }, { kind: "guildManager" }),
      ).resolves.toBe(false);
    });
  });

  describe("permit", () => {
    it("delegates to container.permitResolver.hasPermit with the actor's fields", async () => {
      const hasPermit = vi.fn().mockResolvedValue(true);
      (container as any).permitResolver = { hasPermit };

      const allowed = await authorize(
        {
          userId: "U1",
          guildId: "G1",
          roleIds: ["R1", "R2"],
          channelId: "C1",
          guildOwnerId: "O1",
        },
        { kind: "permit", node: "mod.ban" },
      );

      expect(allowed).toBe(true);
      expect(hasPermit).toHaveBeenCalledWith({
        guildId: "G1",
        userId: "U1",
        roleIds: ["R1", "R2"],
        channelId: "C1",
        guildOwnerId: "O1",
        permitNode: "mod.ban",
      });
    });

    it("denies outright when the actor has no guildId - a permit is always guild-scoped", async () => {
      const hasPermit = vi.fn().mockResolvedValue(true);
      (container as any).permitResolver = { hasPermit };

      await expect(
        authorize({ userId: "U1" }, { kind: "permit", node: "mod.ban" }),
      ).resolves.toBe(false);
      expect(hasPermit).not.toHaveBeenCalled();
    });
  });
});

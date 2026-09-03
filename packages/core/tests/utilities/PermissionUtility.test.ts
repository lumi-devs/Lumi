import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { PermissionUtility } from "#utilities/pieces/PermissionUtility.js";

describe("PermissionUtility", () => {
  let service: PermissionUtility;
  let mockPermissions: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPermissions = {
      listPermits: vi.fn(),
      getPermit: vi.fn(),
      findPermitByName: vi.fn(),
      createPermit: vi.fn(),
      updatePermitNodes: vi.fn(),
      renamePermit: vi.fn(),
      deletePermit: vi.fn(),
      assignPermit: vi.fn(),
      unassignPermit: vi.fn(),
    };

    (container as any).db = { permissions: mockPermissions } as any;

    service = new PermissionUtility(
      { name: "permissions", store: { name: "utilities" } } as any,
      {},
    );
  });

  describe("createPermit", () => {
    it("rejects creating an enforced permit", async () => {
      await expect(
        service.createPermit("G1", "Fake Tier", "enforced", ["admin.*"]),
      ).rejects.toThrow(/fixed system tiers/i);
      expect(mockPermissions.createPermit).not.toHaveBeenCalled();
    });

    it("rejects an invalid kind", async () => {
      await expect(
        service.createPermit("G1", "Weird", "bogus", ["admin.*"]),
      ).rejects.toThrow(/invalid permit kind/i);
    });

    it("rejects a duplicate name in the same guild", async () => {
      mockPermissions.findPermitByName.mockResolvedValue({ id: 1, name: "Mods" });
      await expect(
        service.createPermit("G1", "Mods", "custom", ["mod.*"]),
      ).rejects.toThrow(/already exists/i);
    });

    it("normalizes and dedupes nodes, then creates", async () => {
      mockPermissions.findPermitByName.mockResolvedValue(null);
      mockPermissions.createPermit.mockResolvedValue({ id: 1 });
      await service.createPermit("G1", " Mods ", "custom", [
        " mod.ban ",
        "mod.ban",
        "",
      ]);
      expect(mockPermissions.createPermit).toHaveBeenCalledWith(
        "G1",
        "Mods",
        "custom",
        ["mod.ban"],
        "grant",
      );
    });

    it("rejects when no nodes remain after normalization", async () => {
      mockPermissions.findPermitByName.mockResolvedValue(null);
      await expect(
        service.createPermit("G1", "Empty", "custom", ["  ", ""]),
      ).rejects.toThrow(/at least one permit node/i);
    });
  });

  describe("deletePermit", () => {
    it("blocks deleting a builtin permit", async () => {
      mockPermissions.getPermit.mockResolvedValue({
        id: 1,
        guildId: "G1",
        builtin: true,
        kind: "enforced",
      });
      await expect(service.deletePermit("G1", 1)).rejects.toThrow(/built-in/i);
      expect(mockPermissions.deletePermit).not.toHaveBeenCalled();
    });

    it("deletes a non-builtin custom permit", async () => {
      mockPermissions.getPermit.mockResolvedValue({
        id: 2,
        guildId: "G1",
        builtin: false,
        kind: "custom",
      });
      await service.deletePermit("G1", 2);
      expect(mockPermissions.deletePermit).toHaveBeenCalledWith("G1", 2);
    });

    it("throws when the permit doesn't exist", async () => {
      mockPermissions.getPermit.mockResolvedValue(null);
      await expect(service.deletePermit("G1", 999)).rejects.toThrow(
        /not found/i,
      );
    });
  });

  describe("assignPermit / unassignPermit invariant enforcement", () => {
    it("rejects assigning a role to an enforced permit", async () => {
      mockPermissions.getPermit.mockResolvedValue({
        id: 1,
        kind: "enforced",
        guildId: "G1",
      });
      await expect(
        service.assignPermit("G1", 1, "role", "111111111111111111"),
      ).rejects.toThrow(/only be assigned to users/i);
      expect(mockPermissions.assignPermit).not.toHaveBeenCalled();
    });

    it("rejects assigning a channel to an enforced permit", async () => {
      mockPermissions.getPermit.mockResolvedValue({
        id: 1,
        kind: "enforced",
        guildId: "G1",
      });
      await expect(
        service.assignPermit("G1", 1, "channel", "111111111111111111"),
      ).rejects.toThrow(/only be assigned to users/i);
    });

    it("assigns a user to an enforced permit", async () => {
      mockPermissions.getPermit.mockResolvedValue({
        id: 1,
        kind: "enforced",
        guildId: "G1",
      });
      mockPermissions.assignPermit.mockResolvedValue({ id: 10 });
      await service.assignPermit("G1", 1, "user", "111111111111111111");
      expect(mockPermissions.assignPermit).toHaveBeenCalledWith(
        "G1",
        1,
        "user",
        "111111111111111111",
      );
    });

    it("assigns a role to a custom permit", async () => {
      mockPermissions.getPermit.mockResolvedValue({
        id: 2,
        kind: "custom",
        guildId: "G1",
      });
      mockPermissions.assignPermit.mockResolvedValue({ id: 11 });
      await service.assignPermit("G1", 2, "role", "222222222222222222");
      expect(mockPermissions.assignPermit).toHaveBeenCalledWith(
        "G1",
        2,
        "role",
        "222222222222222222",
      );
    });

    it("assigns a user to a custom permit (per-user overrides for precedence/deny)", async () => {
      mockPermissions.getPermit.mockResolvedValue({
        id: 2,
        kind: "custom",
        guildId: "G1",
      });
      mockPermissions.assignPermit.mockResolvedValue({ id: 12 });
      await service.assignPermit("G1", 2, "user", "333333333333333333");
      expect(mockPermissions.assignPermit).toHaveBeenCalledWith(
        "G1",
        2,
        "user",
        "333333333333333333",
      );
    });

    it("assigns a channel to a custom permit", async () => {
      mockPermissions.getPermit.mockResolvedValue({
        id: 2,
        kind: "custom",
        guildId: "G1",
      });
      mockPermissions.assignPermit.mockResolvedValue({ id: 13 });
      await service.assignPermit("G1", 2, "channel", "444444444444444444");
      expect(mockPermissions.assignPermit).toHaveBeenCalledWith(
        "G1",
        2,
        "channel",
        "444444444444444444",
      );
    });

    it("rejects an invalid snowflake target", async () => {
      mockPermissions.getPermit.mockResolvedValue({
        id: 2,
        kind: "custom",
        guildId: "G1",
      });
      await expect(
        service.assignPermit("G1", 2, "role", "not-a-snowflake"),
      ).rejects.toThrow(/invalid mention/i);
    });

    it("unassignPermit enforces the same invariant", async () => {
      mockPermissions.getPermit.mockResolvedValue({
        id: 1,
        kind: "enforced",
        guildId: "G1",
      });
      await expect(
        service.unassignPermit("G1", 1, "role", "111111111111111111"),
      ).rejects.toThrow(/only be assigned to users/i);
      expect(mockPermissions.unassignPermit).not.toHaveBeenCalled();
    });
  });

  describe("updatePermitNodes", () => {
    it("rejects an empty node list", async () => {
      await expect(service.updatePermitNodes("G1", 1, [])).rejects.toThrow(
        /at least one permit node/i,
      );
    });

    it("normalizes and forwards the node list", async () => {
      mockPermissions.updatePermitNodes.mockResolvedValue({ id: 1 });
      await service.updatePermitNodes("G1", 1, [" mod.ban ", "mod.ban"]);
      expect(mockPermissions.updatePermitNodes).toHaveBeenCalledWith("G1", 1, [
        "mod.ban",
      ]);
    });
  });

  describe("renamePermit", () => {
    it("rejects a duplicate name", async () => {
      mockPermissions.getPermit.mockResolvedValue({
        id: 1,
        guildId: "G1",
        name: "Old",
      });
      mockPermissions.findPermitByName.mockResolvedValue({ id: 2, name: "New" });
      await expect(service.renamePermit("G1", 1, "New")).rejects.toThrow(
        /already exists/i,
      );
    });

    it("allows renaming to the same permit's own current name match", async () => {
      mockPermissions.getPermit.mockResolvedValue({
        id: 1,
        guildId: "G1",
        name: "Old",
      });
      mockPermissions.findPermitByName.mockResolvedValue({ id: 1, name: "Old" });
      mockPermissions.renamePermit.mockResolvedValue({ id: 1, name: "Old" });
      await service.renamePermit("G1", 1, "Old");
      expect(mockPermissions.renamePermit).toHaveBeenCalledWith("G1", 1, "Old");
    });
  });

  // Guild B's builtin "Extra Owner" permit carries a "*" node, so reaching it
  // by id from guild A would be owner escalation.
  describe("cross-guild permit isolation", () => {
    const FOREIGN_EXTRA_OWNER = {
      id: 42,
      guildId: "GUILD_B",
      name: "Extra Owner",
      kind: "enforced",
      nodes: ["*"],
      builtin: true,
    };

    beforeEach(() => {
      mockPermissions.getPermit.mockImplementation(
        async (guildId: string, permitId: number) =>
          permitId === FOREIGN_EXTRA_OWNER.id && guildId === "GUILD_B"
            ? FOREIGN_EXTRA_OWNER
            : null,
      );
    });

    it("refuses to assign another guild's Extra Owner permit", async () => {
      await expect(
        service.assignPermit(
          "GUILD_A",
          FOREIGN_EXTRA_OWNER.id,
          "user",
          "111111111111111111",
        ),
      ).rejects.toThrow(/not found/i);
      expect(mockPermissions.assignPermit).not.toHaveBeenCalled();
    });

    it("refuses to unassign from another guild's permit", async () => {
      await expect(
        service.unassignPermit(
          "GUILD_A",
          FOREIGN_EXTRA_OWNER.id,
          "user",
          "111111111111111111",
        ),
      ).rejects.toThrow(/not found/i);
      expect(mockPermissions.unassignPermit).not.toHaveBeenCalled();
    });

    it("refuses to delete another guild's permit", async () => {
      await expect(
        service.deletePermit("GUILD_A", FOREIGN_EXTRA_OWNER.id),
      ).rejects.toThrow(/not found/i);
      expect(mockPermissions.deletePermit).not.toHaveBeenCalled();
    });

    it("refuses to rename another guild's permit", async () => {
      await expect(
        service.renamePermit("GUILD_A", FOREIGN_EXTRA_OWNER.id, "Pwned"),
      ).rejects.toThrow(/not found/i);
      expect(mockPermissions.renamePermit).not.toHaveBeenCalled();
    });

    it("refuses to rewrite another guild's permit nodes", async () => {
      mockPermissions.updatePermitNodes.mockResolvedValue(null);
      await expect(
        service.updatePermitNodes("GUILD_A", FOREIGN_EXTRA_OWNER.id, ["*"]),
      ).rejects.toThrow(/not found/i);
      expect(mockPermissions.updatePermitNodes).toHaveBeenCalledWith(
        "GUILD_A",
        FOREIGN_EXTRA_OWNER.id,
        ["*"],
      );
    });

    it("does not leak the foreign permit through getPermit", async () => {
      await expect(
        service.getPermit("GUILD_A", FOREIGN_EXTRA_OWNER.id),
      ).resolves.toBeNull();
    });

    it("still resolves the permit for its owning guild", async () => {
      await expect(
        service.getPermit("GUILD_B", FOREIGN_EXTRA_OWNER.id),
      ).resolves.toEqual(FOREIGN_EXTRA_OWNER);
    });
  });

  describe("exportPermits", () => {
    it("excludes builtin permits and shapes role assignments", async () => {
      mockPermissions.listPermits.mockResolvedValue([
        { id: 1, name: "Extra Owner", kind: "enforced", nodes: ["*"], builtin: true, assignments: [] },
        {
          id: 2,
          name: "Mods",
          kind: "custom",
          nodes: ["mod.*"],
          builtin: false,
          assignments: [
            { targetType: "role", targetId: "111" },
            { targetType: "role", targetId: "222" },
          ],
        },
      ]);

      const result = await service.exportPermits("G1");

      expect(result.permits).toEqual([
        { name: "Mods", nodes: ["mod.*"], roleIds: ["111", "222"] },
      ]);
    });
  });

  describe("importPermits", () => {
    it("rejects a payload without a permits array", async () => {
      await expect(service.importPermits("G1", { foo: "bar" })).rejects.toThrow(
        /not a valid permit export/i,
      );
    });

    it("creates permits that don't exist yet and assigns their roles", async () => {
      mockPermissions.findPermitByName.mockResolvedValue(null);
      mockPermissions.createPermit.mockResolvedValue({ id: 5, name: "Mods" });
      mockPermissions.assignPermit.mockResolvedValue({});

      const result = await service.importPermits("G1", {
        version: 1,
        exportedAt: "now",
        permits: [{ name: "Mods", nodes: ["mod.*"], roleIds: ["111111111111111111"] }],
      });

      expect(mockPermissions.createPermit).toHaveBeenCalledWith("G1", "Mods", "custom", ["mod.*"], "grant");
      expect(mockPermissions.assignPermit).toHaveBeenCalledWith("G1", 5, "role", "111111111111111111");
      expect(result).toEqual({ created: 1, updated: 0, skipped: [] });
    });

    it("updates an existing permit's nodes instead of creating a duplicate", async () => {
      mockPermissions.findPermitByName.mockResolvedValue({ id: 9, name: "Mods", builtin: false });
      mockPermissions.updatePermitNodes.mockResolvedValue({ id: 9 });

      const result = await service.importPermits("G1", {
        permits: [{ name: "Mods", nodes: ["mod.*", "mod.warn"], roleIds: [] }],
      });

      expect(mockPermissions.updatePermitNodes).toHaveBeenCalledWith("G1", 9, [
        "mod.*",
        "mod.warn",
      ]);
      expect(mockPermissions.createPermit).not.toHaveBeenCalled();
      expect(result).toEqual({ created: 0, updated: 1, skipped: [] });
    });

    it("skips a malformed entry without aborting the rest", async () => {
      mockPermissions.findPermitByName.mockResolvedValue(null);
      mockPermissions.createPermit.mockResolvedValue({ id: 5, name: "Good" });

      const result = await service.importPermits("G1", {
        permits: [
          { name: "", nodes: ["mod.*"], roleIds: [] },
          { name: "Good", nodes: ["mod.*"], roleIds: [] },
        ],
      });

      expect(result.created).toBe(1);
    });

    it("records a skip when creating a permit throws", async () => {
      mockPermissions.findPermitByName.mockResolvedValue(null);
      mockPermissions.createPermit.mockRejectedValue(new Error("boom"));

      const result = await service.importPermits("G1", {
        permits: [{ name: "Mods", nodes: ["mod.*"], roleIds: [] }],
      });

      expect(result.created).toBe(0);
      expect(result.skipped).toEqual([{ name: "Mods", reason: "boom" }]);
    });

    it("ignores malformed role IDs in an entry", async () => {
      mockPermissions.findPermitByName.mockResolvedValue(null);
      mockPermissions.createPermit.mockResolvedValue({ id: 5, name: "Mods" });

      await service.importPermits("G1", {
        permits: [{ name: "Mods", nodes: ["mod.*"], roleIds: ["not-a-snowflake", "111111111111111111"] }],
      });

      expect(mockPermissions.assignPermit).toHaveBeenCalledTimes(1);
      expect(mockPermissions.assignPermit).toHaveBeenCalledWith("G1", 5, "role", "111111111111111111");
    });
  });
});

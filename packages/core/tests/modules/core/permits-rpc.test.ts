import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import type { RpcActionName } from "@lumi/contracts/rpc";
import { getRpcHandler, registerRpcHandlers } from "#lib/rpc/registry.js";

const GUILD_ID = "123456789012345678";
const OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";

describe("core module permit RPC handlers", () => {
  let guild: any;
  let permissionsUtility: any;

  beforeEach(() => {
    vi.clearAllMocks();

    guild = {
      id: GUILD_ID,
      ownerId: OWNER_ID,
      members: { fetch: vi.fn() },
    };

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    container.client = {
      guilds: { cache: new Map([[GUILD_ID, guild]]) },
    } as any;

    permissionsUtility = {
      listPermits: vi.fn().mockResolvedValue([]),
      createPermit: vi.fn().mockResolvedValue({ id: 1, name: "mods" }),
      renamePermit: vi.fn().mockResolvedValue(undefined),
      updatePermitNodes: vi.fn().mockResolvedValue({ id: 1, name: "mods" }),
      getPermit: vi.fn().mockResolvedValue({ id: 1, name: "mods" }),
      deletePermit: vi.fn().mockResolvedValue(undefined),
      assignPermit: vi.fn().mockResolvedValue(undefined),
      unassignPermit: vi.fn().mockResolvedValue(undefined),
    };

    container.stores = {
      get: vi.fn((name: string) =>
        name === "utilities"
          ? {
              get: (key: string) =>
                key === "permissions" ? permissionsUtility : undefined,
            }
          : { loaded: () => [], get: () => undefined },
      ),
    } as any;

    registerRpcHandlers();
  });

  const handlerFor = (action: RpcActionName) => {
    const handler = getRpcHandler(action);
    if (!handler) throw new Error(`${action} handler not registered`);
    return handler;
  };

  const call = (action: RpcActionName, data?: unknown, actorId = OWNER_ID) =>
    handlerFor(action)({ id: "req", action, guildId: GUILD_ID, actorId, data });

  const denyPermissions = () =>
    guild.members.fetch.mockResolvedValue({
      permissions: { has: vi.fn().mockReturnValue(false) },
    });

  describe("guild.permits.create", () => {
    it("creates a permit with the requested nodes", async () => {
      const res = (await call("guild.permits.create", {
        name: "mods",
        kind: "custom",
        nodes: ["mod.ban"],
      })) as any;

      expect(res.success).toBe(true);
      expect(permissionsUtility.createPermit).toHaveBeenCalledWith(
        GUILD_ID,
        "mods",
        "custom",
        ["mod.ban"],
      );
    });

    it("rejects an unknown permit kind", async () => {
      await expect(
        call("guild.permits.create", {
          name: "mods",
          kind: "superuser",
          nodes: ["mod.ban"],
        }),
      ).rejects.toThrow("Bad payload");

      expect(permissionsUtility.createPermit).not.toHaveBeenCalled();
    });

    it("rejects a permit with no nodes", async () => {
      await expect(
        call("guild.permits.create", {
          name: "mods",
          kind: "custom",
          nodes: [],
        }),
      ).rejects.toThrow("Bad payload");
    });

    it("rejects an empty permit name", async () => {
      await expect(
        call("guild.permits.create", {
          name: "",
          kind: "custom",
          nodes: ["mod.ban"],
        }),
      ).rejects.toThrow("Bad payload");
    });

    it("surfaces a duplicate-name conflict from the permissions utility", async () => {
      permissionsUtility.createPermit.mockRejectedValue(
        new Error("A permit named mods already exists."),
      );

      await expect(
        call("guild.permits.create", {
          name: "mods",
          kind: "custom",
          nodes: ["mod.ban"],
        }),
      ).rejects.toThrow("A permit named mods already exists.");
    });

    it("rejects an actor without ManageGuild before creating", async () => {
      denyPermissions();

      await expect(
        call(
          "guild.permits.create",
          { name: "mods", kind: "custom", nodes: ["mod.ban"] },
          INTRUDER_ID,
        ),
      ).rejects.toThrow("Missing ManageGuild permission");

      expect(permissionsUtility.createPermit).not.toHaveBeenCalled();
    });
  });

  describe("guild.permits.update", () => {
    it("renames without touching nodes when only a name is supplied", async () => {
      await call("guild.permits.update", {
        permitId: 1,
        name: "senior-mods",
      });

      expect(permissionsUtility.renamePermit).toHaveBeenCalledWith(
        GUILD_ID,
        1,
        "senior-mods",
      );
      expect(permissionsUtility.updatePermitNodes).not.toHaveBeenCalled();
      expect(permissionsUtility.getPermit).toHaveBeenCalledWith(GUILD_ID, 1);
    });

    it("replaces nodes when they are supplied", async () => {
      await call("guild.permits.update", {
        permitId: 1,
        nodes: ["mod.kick"],
      });

      expect(permissionsUtility.updatePermitNodes).toHaveBeenCalledWith(
        GUILD_ID,
        1,
        ["mod.kick"],
      );
      expect(permissionsUtility.renamePermit).not.toHaveBeenCalled();
    });

    it("applies both a rename and a node replacement together", async () => {
      await call("guild.permits.update", {
        permitId: 1,
        name: "senior-mods",
        nodes: ["mod.kick"],
      });

      expect(permissionsUtility.renamePermit).toHaveBeenCalled();
      expect(permissionsUtility.updatePermitNodes).toHaveBeenCalled();
      expect(permissionsUtility.getPermit).not.toHaveBeenCalled();
    });
  });

  describe("guild.permits.delete", () => {
    it("deletes the permit", async () => {
      const res = (await call("guild.permits.delete", {
        permitId: 7,
      })) as any;

      expect(res).toEqual({ success: true });
      expect(permissionsUtility.deletePermit).toHaveBeenCalledWith(GUILD_ID, 7);
    });

    it("rejects an actor without ManageGuild before deleting", async () => {
      denyPermissions();

      await expect(
        call("guild.permits.delete", { permitId: 7 }, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");

      expect(permissionsUtility.deletePermit).not.toHaveBeenCalled();
    });

    it("surfaces a missing permit from the permissions utility", async () => {
      permissionsUtility.deletePermit.mockRejectedValue(
        new Error("Permit 7 not found"),
      );

      await expect(
        call("guild.permits.delete", { permitId: 7 }),
      ).rejects.toThrow("Permit 7 not found");
    });

    it("keeps a duplicate delete from masking the first result", async () => {
      permissionsUtility.deletePermit
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Permit 7 not found"));

      const results = await Promise.allSettled([
        call("guild.permits.delete", { permitId: 7 }),
        call("guild.permits.delete", { permitId: 7 }),
      ]);

      expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
      expect(permissionsUtility.deletePermit).toHaveBeenCalledTimes(2);
    });
  });

  describe("guild.permits.assign", () => {
    it("assigns a permit to a role", async () => {
      const res = (await call("guild.permits.assign", {
        permitId: 1,
        targetType: "role",
        targetId: "999999999999999999",
      })) as any;

      expect(res).toEqual({ success: true });
      expect(permissionsUtility.assignPermit).toHaveBeenCalledWith(
        GUILD_ID,
        1,
        "role",
        "999999999999999999",
      );
    });

    it("unassigns a permit from a role", async () => {
      await call("guild.permits.unassign", {
        permitId: 1,
        targetType: "role",
        targetId: "999999999999999999",
      });

      expect(permissionsUtility.unassignPermit).toHaveBeenCalledWith(
        GUILD_ID,
        1,
        "role",
        "999999999999999999",
      );
    });

    it("rejects an unknown target type", async () => {
      await expect(
        call("guild.permits.assign", {
          permitId: 1,
          targetType: "planet",
          targetId: "999999999999999999",
        }),
      ).rejects.toThrow("Bad payload");

      expect(permissionsUtility.assignPermit).not.toHaveBeenCalled();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { RpcActions } from "@lumi/contracts";
import { rpcHandlers } from "#lib/rpc/dispatch.js";
import { DashboardModule } from "#modules/dashboard/index.js";

vi.mock("#lib/module-system/Utility.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, getUtility: vi.fn() };
});

import { getUtility } from "#lib/module-system/Utility.js";

const GUILD_ID = "123456789012345678";
const OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";

describe("dashboard write RPC handlers", () => {
  let guild: any;
  let configUtility: any;
  let permissionsUtility: any;
  let transaction: any;

  beforeEach(async () => {
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

    transaction = {
      write: vi.fn(),
      submit: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
    };

    (container as any).db = {
      ensureGuild: vi.fn().mockResolvedValue(undefined),
      transaction: vi.fn().mockResolvedValue(transaction),
      modules: {
        setModuleGuildEnabled: vi.fn().mockResolvedValue(undefined),
      },
      config: {
        getGuildSettings: vi
          .fn()
          .mockResolvedValue({ prefix: "!", locale: "en-US" }),
        deleteModuleConfigKey: vi.fn().mockResolvedValue(undefined),
        getModuleConfig: vi.fn().mockResolvedValue(null),
      },
    };

    configUtility = {
      setConfig: vi.fn().mockResolvedValue({ coerced: 5 }),
    };
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

    (getUtility as any).mockImplementation((name: string) => {
      if (name === "config") return configUtility;
      if (name === "permissions") return permissionsUtility;
      return null;
    });

    const modulesStore = {
      loaded: () => [],
      get: vi.fn().mockImplementation((name: string) =>
        name === "afk" ? { meta: { name: "afk" } } : undefined,
      ),
      isAddonModule: () => false,
    };

    container.stores = {
      get: vi.fn().mockImplementation((store: string) =>
        store === "modules" ? modulesStore : { loaded: () => [] },
      ),
    } as any;

    const mod = new DashboardModule({} as any, { name: "dashboard" });
    await mod.onLoad();
  });

  const handlerFor = (action: string) => {
    const handler = rpcHandlers.get(action);
    if (!handler) throw new Error(`${action} handler not registered`);
    return handler;
  };

  const call = (action: string, data?: unknown, actorId = OWNER_ID) =>
    handlerFor(action)({ id: "req", action, guildId: GUILD_ID, actorId, data });

  describe("guild.module.toggle", () => {
    it("persists the new enabled state for a known module", async () => {
      const res = (await call(RpcActions.guildModuleToggle, {
        moduleName: "afk",
        enabled: false,
      })) as any;

      expect(res).toEqual({ success: true, enabled: false });
      expect(container.db.modules.setModuleGuildEnabled).toHaveBeenCalledWith(
        GUILD_ID,
        "afk",
        false,
      );
    });

    it("refuses to disable the core module", async () => {
      await expect(
        call(RpcActions.guildModuleToggle, {
          moduleName: "core",
          enabled: false,
        }),
      ).rejects.toThrow("Cannot disable the core module");

      expect(container.db.modules.setModuleGuildEnabled).not.toHaveBeenCalled();
    });

    it("rejects a module the store does not know", async () => {
      await expect(
        call(RpcActions.guildModuleToggle, {
          moduleName: "ghost",
          enabled: true,
        }),
      ).rejects.toThrow("No module named");

      expect(container.db.modules.setModuleGuildEnabled).not.toHaveBeenCalled();
    });

    it("rejects a payload with a non-boolean enabled flag", async () => {
      await expect(
        call(RpcActions.guildModuleToggle, {
          moduleName: "afk",
          enabled: "yes",
        }),
      ).rejects.toThrow("Bad payload");

      expect(container.db.modules.setModuleGuildEnabled).not.toHaveBeenCalled();
    });

    it("rejects an actor without ManageGuild before writing", async () => {
      guild.members.fetch.mockResolvedValue({
        permissions: { has: vi.fn().mockReturnValue(false) },
      });

      await expect(
        call(
          RpcActions.guildModuleToggle,
          { moduleName: "afk", enabled: false },
          INTRUDER_ID,
        ),
      ).rejects.toThrow("Missing ManageGuild permission");

      expect(container.db.modules.setModuleGuildEnabled).not.toHaveBeenCalled();
    });
  });

  describe("guild.config.set", () => {
    it("writes a coerced value through the config utility", async () => {
      const res = (await call(RpcActions.guildConfigSet, {
        moduleName: "mod",
        key: "maxMultiTargets",
        value: "5",
      })) as any;

      expect(res).toEqual({ success: true, key: "maxMultiTargets", value: 5 });
      expect(configUtility.setConfig).toHaveBeenCalledWith(
        GUILD_ID,
        "mod",
        "maxMultiTargets",
        "5",
        OWNER_ID,
      );
    });

    it("deletes the key instead of writing when the value is null", async () => {
      const res = (await call(RpcActions.guildConfigSet, {
        moduleName: "mod",
        key: "logChannel",
        value: null,
      })) as any;

      expect(res).toEqual({ success: true, key: "logChannel", value: null });
      expect(container.db.config.deleteModuleConfigKey).toHaveBeenCalledWith(
        GUILD_ID,
        "mod",
        "logChannel",
      );
      expect(configUtility.setConfig).not.toHaveBeenCalled();
    });

    it("treats an empty string as a key deletion", async () => {
      await call(RpcActions.guildConfigSet, {
        moduleName: "mod",
        key: "logChannel",
        value: "",
      });

      expect(container.db.config.deleteModuleConfigKey).toHaveBeenCalled();
      expect(configUtility.setConfig).not.toHaveBeenCalled();
    });

    it("attributes the write to the acting dashboard user", async () => {
      await call(
        RpcActions.guildConfigSet,
        { moduleName: "mod", key: "k", value: "v" },
        OWNER_ID,
      );

      expect(configUtility.setConfig).toHaveBeenCalledWith(
        GUILD_ID,
        "mod",
        "k",
        "v",
        OWNER_ID,
      );
    });

    it("rejects a payload missing the key", async () => {
      await expect(
        call(RpcActions.guildConfigSet, { moduleName: "mod", value: 1 }),
      ).rejects.toThrow("Bad payload");

      expect(configUtility.setConfig).not.toHaveBeenCalled();
    });

    it("rejects an actor without ManageGuild before writing", async () => {
      guild.members.fetch.mockResolvedValue({
        permissions: { has: vi.fn().mockReturnValue(false) },
      });

      await expect(
        call(
          RpcActions.guildConfigSet,
          { moduleName: "mod", key: "k", value: "v" },
          INTRUDER_ID,
        ),
      ).rejects.toThrow("Missing ManageGuild permission");

      expect(configUtility.setConfig).not.toHaveBeenCalled();
    });
  });

  describe("guild.settings.set", () => {
    it("commits the settings through a guild transaction", async () => {
      const res = (await call(RpcActions.guildSettingsSet, {
        prefix: "?",
      })) as any;

      expect(transaction.write).toHaveBeenCalledWith({ prefix: "?" });
      expect(transaction.submit).toHaveBeenCalled();
      expect(transaction.dispose).toHaveBeenCalled();
      expect(res.success).toBe(true);
      expect(res.settings).toEqual({ prefix: "!", locale: "en-US" });
    });

    it("rejects an unsupported locale before opening a transaction", async () => {
      await expect(
        call(RpcActions.guildSettingsSet, { locale: "xx-XX" }),
      ).rejects.toThrow("Unsupported locale");

      expect(container.db.transaction).not.toHaveBeenCalled();
    });

    it("rejects an unsupported timezone before opening a transaction", async () => {
      await expect(
        call(RpcActions.guildSettingsSet, { timezone: "Mars/Olympus" }),
      ).rejects.toThrow("Unsupported timezone");

      expect(container.db.transaction).not.toHaveBeenCalled();
    });

    it("accepts a valid IANA timezone", async () => {
      await call(RpcActions.guildSettingsSet, { timezone: "Europe/Berlin" });

      expect(transaction.write).toHaveBeenCalledWith({
        timezone: "Europe/Berlin",
      });
    });

    it("rejects a prefix longer than the allowed length", async () => {
      await expect(
        call(RpcActions.guildSettingsSet, { prefix: "toolong" }),
      ).rejects.toThrow("Bad payload");

      expect(container.db.transaction).not.toHaveBeenCalled();
    });

    it("rejects a mute role id that is not a snowflake", async () => {
      await expect(
        call(RpcActions.guildSettingsSet, { muteRoleId: "not-a-snowflake" }),
      ).rejects.toThrow("Bad payload");
    });

    it("disposes the transaction even when the commit fails", async () => {
      transaction.submit.mockRejectedValue(new Error("deadlock detected"));

      await expect(
        call(RpcActions.guildSettingsSet, { prefix: "?" }),
      ).rejects.toThrow("deadlock detected");

      expect(transaction.dispose).toHaveBeenCalled();
    });
  });

  describe("guild.permits.create", () => {
    it("creates a permit with the requested nodes", async () => {
      const res = (await call(RpcActions.guildPermitsCreate, {
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
        call(RpcActions.guildPermitsCreate, {
          name: "mods",
          kind: "superuser",
          nodes: ["mod.ban"],
        }),
      ).rejects.toThrow("Bad payload");

      expect(permissionsUtility.createPermit).not.toHaveBeenCalled();
    });

    it("rejects a permit with no nodes", async () => {
      await expect(
        call(RpcActions.guildPermitsCreate, {
          name: "mods",
          kind: "custom",
          nodes: [],
        }),
      ).rejects.toThrow("Bad payload");
    });

    it("rejects an empty permit name", async () => {
      await expect(
        call(RpcActions.guildPermitsCreate, {
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
        call(RpcActions.guildPermitsCreate, {
          name: "mods",
          kind: "custom",
          nodes: ["mod.ban"],
        }),
      ).rejects.toThrow("A permit named mods already exists.");
    });

    it("rejects an actor without ManageGuild before creating", async () => {
      guild.members.fetch.mockResolvedValue({
        permissions: { has: vi.fn().mockReturnValue(false) },
      });

      await expect(
        call(
          RpcActions.guildPermitsCreate,
          { name: "mods", kind: "custom", nodes: ["mod.ban"] },
          INTRUDER_ID,
        ),
      ).rejects.toThrow("Missing ManageGuild permission");

      expect(permissionsUtility.createPermit).not.toHaveBeenCalled();
    });
  });

  describe("guild.permits.update", () => {
    it("renames without touching nodes when only a name is supplied", async () => {
      await call(RpcActions.guildPermitsUpdate, {
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
      await call(RpcActions.guildPermitsUpdate, {
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
      await call(RpcActions.guildPermitsUpdate, {
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
      const res = (await call(RpcActions.guildPermitsDelete, {
        permitId: 7,
      })) as any;

      expect(res).toEqual({ success: true });
      expect(permissionsUtility.deletePermit).toHaveBeenCalledWith(GUILD_ID, 7);
    });

    it("rejects an actor without ManageGuild before deleting", async () => {
      guild.members.fetch.mockResolvedValue({
        permissions: { has: vi.fn().mockReturnValue(false) },
      });

      await expect(
        call(RpcActions.guildPermitsDelete, { permitId: 7 }, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");

      expect(permissionsUtility.deletePermit).not.toHaveBeenCalled();
    });

    it("surfaces a missing permit from the permissions utility", async () => {
      permissionsUtility.deletePermit.mockRejectedValue(
        new Error("Permit 7 not found"),
      );

      await expect(
        call(RpcActions.guildPermitsDelete, { permitId: 7 }),
      ).rejects.toThrow("Permit 7 not found");
    });
  });

  describe("guild.permits.assign", () => {
    it("assigns a permit to a role", async () => {
      const res = (await call(RpcActions.guildPermitsAssign, {
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
      await call(RpcActions.guildPermitsUnassign, {
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
        call(RpcActions.guildPermitsAssign, {
          permitId: 1,
          targetType: "planet",
          targetId: "999999999999999999",
        }),
      ).rejects.toThrow("Bad payload");

      expect(permissionsUtility.assignPermit).not.toHaveBeenCalled();
    });
  });

  describe("duplicate delivery of the same write", () => {
    it("converges on the requested module state when a toggle arrives twice", async () => {
      const payload = { moduleName: "afk", enabled: false };

      const results = await Promise.all([
        call(RpcActions.guildModuleToggle, payload),
        call(RpcActions.guildModuleToggle, payload),
      ]);

      expect(results).toEqual([
        { success: true, enabled: false },
        { success: true, enabled: false },
      ]);
      for (const callArgs of (
        container.db.modules.setModuleGuildEnabled as any
      ).mock.calls) {
        expect(callArgs).toEqual([GUILD_ID, "afk", false]);
      }
    });

    it("gives each concurrent settings write its own transaction and disposes both", async () => {
      const first = { ...transaction };
      const second = {
        write: vi.fn(),
        submit: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
      };
      (container.db.transaction as any)
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(second);

      await Promise.all([
        call(RpcActions.guildSettingsSet, { prefix: "?" }),
        call(RpcActions.guildSettingsSet, { prefix: "." }),
      ]);

      expect(first.dispose).toHaveBeenCalled();
      expect(second.dispose).toHaveBeenCalled();
    });

    it("keeps a duplicate permit delete from masking the first result", async () => {
      permissionsUtility.deletePermit
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Permit 7 not found"));

      const results = await Promise.allSettled([
        call(RpcActions.guildPermitsDelete, { permitId: 7 }),
        call(RpcActions.guildPermitsDelete, { permitId: 7 }),
      ]);

      expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
      expect(permissionsUtility.deletePermit).toHaveBeenCalledTimes(2);
    });

    it("rejects both deliveries when the actor lacks permission", async () => {
      guild.members.fetch.mockResolvedValue({
        permissions: { has: vi.fn().mockReturnValue(false) },
      });

      const results = await Promise.allSettled([
        call(
          RpcActions.guildModuleToggle,
          { moduleName: "afk", enabled: false },
          INTRUDER_ID,
        ),
        call(
          RpcActions.guildModuleToggle,
          { moduleName: "afk", enabled: false },
          INTRUDER_ID,
        ),
      ]);

      expect(results.every((r) => r.status === "rejected")).toBe(true);
      expect(container.db.modules.setModuleGuildEnabled).not.toHaveBeenCalled();
    });
  });
});

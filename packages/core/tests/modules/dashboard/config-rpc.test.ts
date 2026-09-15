import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import type { RpcActionName } from "@lumi/contracts/rpc";
import { getRpcHandler, registerRpcHandlers } from "#lib/rpc/registry.js";

const GUILD_ID = "123456789012345678";
const OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";

describe("dashboard module config write RPC handlers", () => {
  let guild: any;
  let configUtility: any;
  let transaction: any;

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
      setConfig: vi
        .fn()
        .mockImplementation((_g: string, _m: string, _k: string, raw: unknown) => ({
          coerced: raw === "5" ? 5 : raw,
        })),
    };

    const modulesStore = {
      loaded: () => [],
      get: vi.fn().mockImplementation((name: string) =>
        name === "afk" ? { meta: { name: "afk" } } : undefined,
      ),
      isAddonModule: () => false,
    };
    const utilitiesStore = {
      get: (key: string) => (key === "config" ? configUtility : undefined),
    };

    container.stores = {
      get: vi.fn().mockImplementation((store: string) =>
        store === "modules" ? modulesStore : utilitiesStore,
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

  describe("guild.module.toggle", () => {
    it("persists the new enabled state for a known module", async () => {
      const res = (await call("guild.module.toggle", {
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
        call("guild.module.toggle", { moduleName: "core", enabled: false }),
      ).rejects.toThrow("Cannot disable the core module");

      expect(container.db.modules.setModuleGuildEnabled).not.toHaveBeenCalled();
    });

    it("rejects a module the store does not know", async () => {
      await expect(
        call("guild.module.toggle", { moduleName: "ghost", enabled: true }),
      ).rejects.toThrow("No module named");

      expect(container.db.modules.setModuleGuildEnabled).not.toHaveBeenCalled();
    });

    it("rejects a payload with a non-boolean enabled flag", async () => {
      await expect(
        call("guild.module.toggle", { moduleName: "afk", enabled: "yes" }),
      ).rejects.toThrow("Bad payload");

      expect(container.db.modules.setModuleGuildEnabled).not.toHaveBeenCalled();
    });

    it("rejects an actor without ManageGuild before writing", async () => {
      denyPermissions();

      await expect(
        call("guild.module.toggle", { moduleName: "afk", enabled: false }, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");

      expect(container.db.modules.setModuleGuildEnabled).not.toHaveBeenCalled();
    });

    it("converges on the requested state when a toggle arrives twice", async () => {
      const payload = { moduleName: "afk", enabled: false };

      const results = await Promise.all([
        call("guild.module.toggle", payload),
        call("guild.module.toggle", payload),
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

    it("rejects both deliveries when the actor lacks permission", async () => {
      denyPermissions();

      const results = await Promise.allSettled([
        call("guild.module.toggle", { moduleName: "afk", enabled: false }, INTRUDER_ID),
        call("guild.module.toggle", { moduleName: "afk", enabled: false }, INTRUDER_ID),
      ]);

      expect(results.every((r) => r.status === "rejected")).toBe(true);
      expect(container.db.modules.setModuleGuildEnabled).not.toHaveBeenCalled();
    });
  });

  describe("guild.config.set", () => {
    it("writes a coerced value through the config utility", async () => {
      const res = (await call("guild.config.set", {
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
      const res = (await call("guild.config.set", {
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
      await call("guild.config.set", {
        moduleName: "mod",
        key: "logChannel",
        value: "",
      });

      expect(container.db.config.deleteModuleConfigKey).toHaveBeenCalled();
      expect(configUtility.setConfig).not.toHaveBeenCalled();
    });

    it("attributes the write to the acting dashboard user", async () => {
      await call("guild.config.set", { moduleName: "mod", key: "k", value: "v" });

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
        call("guild.config.set", { moduleName: "mod", value: 1 }),
      ).rejects.toThrow("Bad payload");

      expect(configUtility.setConfig).not.toHaveBeenCalled();
    });

    it("rejects an actor without ManageGuild before writing", async () => {
      denyPermissions();

      await expect(
        call("guild.config.set", { moduleName: "mod", key: "k", value: "v" }, INTRUDER_ID),
      ).rejects.toThrow("Missing ManageGuild permission");

      expect(configUtility.setConfig).not.toHaveBeenCalled();
    });
  });

  describe("guild.config.setMany", () => {
    it("writes every entry through the same per-field path", async () => {
      const res = (await call("guild.config.setMany", {
        moduleName: "security",
        values: { max_bans: "3", window_seconds: "60" },
      })) as any;

      expect(res).toEqual({
        success: true,
        updated: { max_bans: "3", window_seconds: "60" },
      });
      expect(configUtility.setConfig).toHaveBeenCalledTimes(2);
      expect(configUtility.setConfig).toHaveBeenCalledWith(
        GUILD_ID,
        "security",
        "max_bans",
        "3",
        OWNER_ID,
      );
      expect(configUtility.setConfig).toHaveBeenCalledWith(
        GUILD_ID,
        "security",
        "window_seconds",
        "60",
        OWNER_ID,
      );
    });

    it("deletes keys whose value is null or empty, like the single-key path", async () => {
      const res = (await call("guild.config.setMany", {
        moduleName: "mod",
        values: { logChannel: null, other: "" },
      })) as any;

      expect(res).toEqual({
        success: true,
        updated: { logChannel: null, other: null },
      });
      expect(container.db.config.deleteModuleConfigKey).toHaveBeenCalledTimes(2);
      expect(configUtility.setConfig).not.toHaveBeenCalled();
    });

    it("mixes writes and deletes in one call", async () => {
      const res = (await call("guild.config.setMany", {
        moduleName: "mod",
        values: { keep: "1", drop: null },
      })) as any;

      expect(res.updated).toEqual({ keep: "1", drop: null });
      expect(configUtility.setConfig).toHaveBeenCalledTimes(1);
      expect(container.db.config.deleteModuleConfigKey).toHaveBeenCalledTimes(1);
    });

    it("accepts an empty values object as a no-op", async () => {
      const res = (await call("guild.config.setMany", {
        moduleName: "mod",
        values: {},
      })) as any;

      expect(res).toEqual({ success: true, updated: {} });
      expect(configUtility.setConfig).not.toHaveBeenCalled();
    });

    it("rejects more entries than the per-call cap of 50", async () => {
      const values = Object.fromEntries(
        Array.from({ length: 51 }, (_, i) => [`k${i}`, "v"]),
      );

      await expect(
        call("guild.config.setMany", { moduleName: "mod", values }),
      ).rejects.toThrow("at most");

      expect(configUtility.setConfig).not.toHaveBeenCalled();
    });

    it("rejects a non-object values payload", async () => {
      await expect(
        call("guild.config.setMany", {
          moduleName: "mod",
          values: ["not", "an", "object"],
        }),
      ).rejects.toThrow("must be an object");

      expect(configUtility.setConfig).not.toHaveBeenCalled();
    });

    it("rejects an entry the per-field validator would reject", async () => {
      await expect(
        call("guild.config.setMany", { moduleName: "mod", values: { "": "v" } }),
      ).rejects.toThrow("Bad payload");

      expect(configUtility.setConfig).not.toHaveBeenCalled();
    });

    it("rejects a payload missing the module name", async () => {
      await expect(
        call("guild.config.setMany", { values: { k: "v" } }),
      ).rejects.toThrow("Bad payload");

      expect(configUtility.setConfig).not.toHaveBeenCalled();
    });

    it("rejects an actor without ManageGuild before writing anything", async () => {
      denyPermissions();

      await expect(
        call(
          "guild.config.setMany",
          { moduleName: "mod", values: { k: "v" } },
          INTRUDER_ID,
        ),
      ).rejects.toThrow("Missing ManageGuild permission");

      expect(configUtility.setConfig).not.toHaveBeenCalled();
      expect(container.db.config.deleteModuleConfigKey).not.toHaveBeenCalled();
    });
  });

  describe("guild.settings.set", () => {
    it("commits the settings through a guild transaction", async () => {
      const res = (await call("guild.settings.set", { prefix: "?" })) as any;

      expect(transaction.write).toHaveBeenCalledWith({ prefix: "?" });
      expect(transaction.submit).toHaveBeenCalled();
      expect(transaction.dispose).toHaveBeenCalled();
      expect(res.success).toBe(true);
      expect(res.settings).toEqual({ prefix: "!", locale: "en-US" });
    });

    it("rejects an unsupported locale before opening a transaction", async () => {
      await expect(
        call("guild.settings.set", { locale: "xx-XX" }),
      ).rejects.toThrow("Unsupported locale");

      expect(container.db.transaction).not.toHaveBeenCalled();
    });

    it("rejects a prefix longer than the allowed length", async () => {
      await expect(
        call("guild.settings.set", { prefix: "toolong" }),
      ).rejects.toThrow("Bad payload");

      expect(container.db.transaction).not.toHaveBeenCalled();
    });

    it("disposes the transaction even when the commit fails", async () => {
      transaction.submit.mockRejectedValue(new Error("deadlock detected"));

      await expect(
        call("guild.settings.set", { prefix: "?" }),
      ).rejects.toThrow("deadlock detected");

      expect(transaction.dispose).toHaveBeenCalled();
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
        call("guild.settings.set", { prefix: "?" }),
        call("guild.settings.set", { prefix: "." }),
      ]);

      expect(first.dispose).toHaveBeenCalled();
      expect(second.dispose).toHaveBeenCalled();
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { container } from "@sapphire/framework";
import { rpcRouter, type RpcActionName } from "@lumi/contracts/rpc";
import { PermitResolver } from "#lib/permissions/PermitResolver.js";
import { dispatchRpc } from "#lib/rpc/dispatch.js";
import {
  cachedGuild,
  requireGuildId,
  requireGuildManager,
} from "#lib/rpc/implement.js";
import { getRpcHandler, registerRpcHandlers } from "#lib/rpc/registry.js";

const GUILD_ID = "123456789012345678";
const OWNER_ID = "111111111111111111";
const ACTOR_ID = "222222222222222222";
const TARGET_ID = "444444444444444444";

/** Mirrors the shape discord.js rejects with, so handlers see a realistic failure. */
function discordApiError(message: string, code: number, status: number) {
  const err = new Error(message) as Error & { code: number; status: number };
  err.code = code;
  err.status = status;
  return err;
}

const DiscordErrors = {
  unknownMember: () => discordApiError("Unknown Member", 10007, 404),
  unknownGuild: () => discordApiError("Unknown Guild", 10004, 404),
  missingAccess: () => discordApiError("Missing Access", 50001, 403),
  rateLimited: () => discordApiError("You are being rate limited.", 0, 429),
  timeout: () => new Error("ETIMEDOUT: connect timed out"),
};

function memberWith(permissions: string[]) {
  return {
    permissions: {
      has: vi.fn().mockImplementation((p: string) => permissions.includes(p)),
    },
  };
}

function mockLogger() {
  container.logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as any;
}

describe("RPC guild access under Discord API failures", () => {
  let guild: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger();

    guild = {
      id: GUILD_ID,
      ownerId: OWNER_ID,
      members: { fetch: vi.fn() },
    };

    container.client = {
      guilds: { cache: new Map([[GUILD_ID, guild]]) },
    } as any;
  });

  describe("requireGuildId", () => {
    it("accepts a valid snowflake", () => {
      expect(requireGuildId(GUILD_ID)).toBe(GUILD_ID);
    });

    it.each([
      ["undefined", undefined],
      ["null", null],
      ["an empty string", ""],
      ["a non-numeric string", "not-a-snowflake"],
      ["a negative number string", "-1"],
    ])("rejects %s with a single stable message", (_label, value) => {
      expect(() => requireGuildId(value as any)).toThrow(
        "guildId is required and must be a valid snowflake",
      );
    });
  });

  describe("requireGuildManager", () => {
    it("requires an actor id", async () => {
      await expect(
        requireGuildManager(GUILD_ID, undefined),
      ).rejects.toThrow("actorId is required");
    });

    it("fails when the guild is not in the bot cache", async () => {
      container.client = { guilds: { cache: new Map() } } as any;

      await expect(requireGuildManager(GUILD_ID, ACTOR_ID)).rejects.toMatchObject({
        message: "Guild not found in bot cache",
        code: "GUILD_NOT_FOUND",
      });
    });

    it("lets the guild owner through without a member fetch", async () => {
      await expect(requireGuildManager(GUILD_ID, OWNER_ID)).resolves.toBe(
        OWNER_ID,
      );
      expect(guild.members.fetch).not.toHaveBeenCalled();
    });

    it("accepts a member holding ManageGuild", async () => {
      guild.members.fetch.mockResolvedValue(memberWith(["ManageGuild"]));

      await expect(requireGuildManager(GUILD_ID, ACTOR_ID)).resolves.toBe(
        ACTOR_ID,
      );
    });

    it("accepts a member holding Administrator", async () => {
      guild.members.fetch.mockResolvedValue(memberWith(["Administrator"]));

      await expect(requireGuildManager(GUILD_ID, ACTOR_ID)).resolves.toBe(
        ACTOR_ID,
      );
    });

    it("denies a member holding neither permission", async () => {
      guild.members.fetch.mockResolvedValue(memberWith([]));

      await expect(requireGuildManager(GUILD_ID, ACTOR_ID)).rejects.toMatchObject({
        message: "Missing ManageGuild permission",
        code: "FORBIDDEN",
      });
    });

    it("denies when the member is no longer in the guild", async () => {
      guild.members.fetch.mockResolvedValue(null);

      await expect(requireGuildManager(GUILD_ID, ACTOR_ID)).rejects.toThrow(
        "Missing ManageGuild permission",
      );
    });

    it.each([
      ["a 404 unknown member", DiscordErrors.unknownMember],
      ["a 403 missing access", DiscordErrors.missingAccess],
      ["a 429 rate limit", DiscordErrors.rateLimited],
      ["a connection timeout", DiscordErrors.timeout],
    ])("denies rather than leaking %s", async (_label, makeError) => {
      guild.members.fetch.mockRejectedValue(makeError());

      await expect(requireGuildManager(GUILD_ID, ACTOR_ID)).rejects.toThrow(
        "Missing ManageGuild permission",
      );
    });

    it("does not surface the raw Discord message to the caller", async () => {
      guild.members.fetch.mockRejectedValue(DiscordErrors.rateLimited());

      await expect(
        requireGuildManager(GUILD_ID, ACTOR_ID),
      ).rejects.not.toThrow(/rate limited/i);
    });

    it("fails closed for an owner id that does not match the actor", async () => {
      guild.members.fetch.mockRejectedValue(DiscordErrors.unknownMember());

      await expect(
        requireGuildManager(GUILD_ID, "999999999999999999"),
      ).rejects.toThrow("Missing ManageGuild permission");
    });
  });

  describe("cachedGuild", () => {
    it("returns the cached guild", () => {
      expect(cachedGuild(GUILD_ID)).toBe(guild);
    });

    it("throws when the guild left or is unavailable", () => {
      container.client = { guilds: { cache: new Map() } } as any;

      expect(() => cachedGuild(GUILD_ID)).toThrow("Guild not found in bot cache");
    });
  });
});

describe("dispatchRpc error shaping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger();

    container.client = {
      application: { owner: { id: OWNER_ID } },
      guilds: { cache: new Map() },
    } as any;

    (container as any).db = {
      config: { isDashboardEnabled: vi.fn().mockResolvedValue(true) },
    };

    registerRpcHandlers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const failWhoAmI = (err: Error) =>
    vi.spyOn(PermitResolver, "isBotOwner").mockImplementation(() => {
      throw err;
    });

  it("reports an unregistered action without throwing", async () => {
    const res = await dispatchRpc({ id: "req-1", action: "nope.missing" });

    expect(res.ok).toBe(false);
    expect(res.error).toContain("No handler registered");
    expect(res.code).toBe("UNKNOWN_ACTION");
    expect(res.id).toBe("req-1");
  });

  it("refuses a guild whose dashboard is switched off", async () => {
    (container.db.config.isDashboardEnabled as any).mockResolvedValue(false);

    const res = await dispatchRpc({
      id: "req-2",
      action: "auth.whoami",
      guildId: GUILD_ID,
    });

    expect(res).toEqual({
      id: "req-2",
      ok: false,
      error: "Dashboard disabled",
      code: "DASHBOARD_DISABLED",
    });
  });

  it("wraps a successful handler result", async () => {
    const res = await dispatchRpc({ id: "req-3", action: "auth.whoami" });

    expect(res).toEqual({ id: "req-3", ok: true, data: { isBotOwner: false } });
  });

  it("converts a thrown handler error into a failed response carrying no data", async () => {
    failWhoAmI(new Error("A permit named mods already exists."));

    const res = await dispatchRpc({
      id: "req-4",
      action: "auth.whoami",
      actorId: ACTOR_ID,
    });

    expect(res.ok).toBe(false);
    expect(res.error).toBe("A permit named mods already exists.");
    expect(res.code).toBe("HANDLER_ERROR");
    expect(res.data).toBeUndefined();
  });

  it("logs the failure for operators while still answering the caller", async () => {
    failWhoAmI(new Error("boom"));

    const res = await dispatchRpc({
      id: "req-5",
      action: "auth.whoami",
      actorId: ACTOR_ID,
    });

    expect(res.ok).toBe(false);
    expect(container.logger.error).toHaveBeenCalled();
  });

  it("answers a Discord API rejection from inside a handler", async () => {
    failWhoAmI(DiscordErrors.unknownGuild());

    const res = await dispatchRpc({
      id: "req-6",
      action: "auth.whoami",
      actorId: ACTOR_ID,
    });

    expect(res.ok).toBe(false);
    expect(res.error).toBe("Unknown Guild");
  });

  it("keeps the correlation id of the request on the response", async () => {
    failWhoAmI(new Error("boom"));

    const res = await dispatchRpc({
      id: "correlation-xyz",
      action: "auth.whoami",
      actorId: ACTOR_ID,
    });

    expect(res.id).toBe("correlation-xyz");
  });

  it("carries the guild-missing code the dashboard branches on", async () => {
    const res = await dispatchRpc({
      id: "req-7",
      action: "guild.panic.get",
      guildId: GUILD_ID,
      actorId: ACTOR_ID,
    });

    expect(res).toEqual({
      id: "req-7",
      ok: false,
      error: "Guild not found in bot cache",
      code: "GUILD_NOT_FOUND",
    });
  });

  it("tags an authorization failure as forbidden", async () => {
    const res = await dispatchRpc({
      id: "req-8",
      action: "system.shards.get",
      actorId: ACTOR_ID,
    });

    expect(res.ok).toBe(false);
    expect(res.code).toBe("FORBIDDEN");
  });
});

describe("implementRpc input parsing", () => {
  let guild: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger();

    guild = { id: GUILD_ID, ownerId: OWNER_ID, members: { fetch: vi.fn() } };
    container.client = {
      guilds: { cache: new Map([[GUILD_ID, guild]]) },
    } as any;

    (container as any).db = {
      ensureGuild: vi.fn().mockResolvedValue(undefined),
      modNotes: {
        create: vi.fn().mockImplementation(
          (guildId: string, userId: string, authorId: string, message: string) => ({
            id: 1,
            guildId,
            userId,
            authorId,
            message,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          }),
        ),
        delete: vi.fn().mockResolvedValue(true),
      },
      config: { deleteModuleConfigKey: vi.fn().mockResolvedValue(undefined) },
      configOverrides: {
        listGuildConfigOverrides: vi.fn().mockResolvedValue([]),
      },
    };

    registerRpcHandlers();
  });

  const call = (action: RpcActionName, data?: unknown) => {
    const handler = getRpcHandler(action);
    if (!handler) throw new Error(`${action} handler not registered`);
    return handler({ id: "req", action, guildId: GUILD_ID, actorId: OWNER_ID, data });
  };

  it("hands the handler the parsed payload", async () => {
    await call("guild.modNotes.add", { userId: TARGET_ID, message: "a" });

    expect(container.db.modNotes.create).toHaveBeenCalledWith(
      GUILD_ID,
      TARGET_ID,
      OWNER_ID,
      "a",
    );
  });

  it("prefixes every validation failure with a stable marker and code", async () => {
    await expect(
      call("guild.modNotes.add", { userId: TARGET_ID, message: "" }),
    ).rejects.toThrow(/^Bad payload: /);
    await expect(
      call("guild.modNotes.add", { userId: TARGET_ID, message: "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a missing required field", async () => {
    await expect(
      call("guild.modNotes.add", { userId: TARGET_ID }),
    ).rejects.toThrow("Bad payload");
  });

  it("rejects a wrongly typed field", async () => {
    await expect(
      call("guild.modNotes.add", { userId: TARGET_ID, message: 5 }),
    ).rejects.toThrow("Bad payload");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "nope"],
    ["a number", 5],
    ["an array", []],
  ])("rejects %s in place of an object payload", async (_label, value) => {
    await expect(call("guild.modNotes.add", value)).rejects.toThrow("Bad payload");
  });

  it("rejects a non-integer where an integer is required", async () => {
    await expect(call("guild.modNotes.remove", { id: 1.5 })).rejects.toThrow(
      "Bad payload",
    );
  });

  it("accepts an oversized string when the schema sets no upper bound", async () => {
    const huge = "x".repeat(100_000);

    const res = (await call("guild.config.set", {
      moduleName: "mod",
      key: huge,
      value: null,
    })) as any;

    expect(res.key).toHaveLength(100_000);
  });

  it("rejects an oversized string when the schema bounds it", async () => {
    await expect(
      call("guild.modNotes.add", { userId: TARGET_ID, message: "x".repeat(1001) }),
    ).rejects.toThrow("Bad payload");
  });

  it("preserves unicode payloads verbatim", async () => {
    for (const message of ["emoji-🎭", "אני", "👨‍👩‍👧‍👦", "日本語"]) {
      const res = (await call("guild.modNotes.add", {
        userId: TARGET_ID,
        message,
      })) as any;
      expect(res.note.message).toBe(message);
    }
  });

  it("does not treat an injection-shaped string as anything but text", async () => {
    const message = "mods'; DROP TABLE permits;--";

    const res = (await call("guild.modNotes.add", {
      userId: TARGET_ID,
      message,
    })) as any;

    expect(res.note.message).toBe(message);
  });

  it("treats a filter-only call with no data as an empty filter", async () => {
    await expect(call("guild.overrides.list")).resolves.toEqual({ overrides: [] });
  });
});

describe("static RPC registry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger();
    registerRpcHandlers();
  });

  it("registers a handler for every action the router declares", () => {
    const missing = Object.keys(rpcRouter).filter((action) => !getRpcHandler(action));
    expect(missing).toEqual([]);
  });

  it("keeps serving a module's reads while that module is not loaded", async () => {
    const guild = { id: GUILD_ID, ownerId: OWNER_ID, members: { fetch: vi.fn() } };
    container.client = {
      guilds: { cache: new Map([[GUILD_ID, guild]]) },
    } as any;
    container.stores = {
      get: vi.fn(() => ({ loaded: () => [], get: () => undefined })),
    } as any;
    (container as any).db = {
      tempvc: { listGenerators: vi.fn().mockResolvedValue([]) },
    };

    const handler = getRpcHandler("guild.tempvc.generators.list");
    await expect(
      handler!({
        id: "req",
        action: "guild.tempvc.generators.list",
        guildId: GUILD_ID,
        actorId: OWNER_ID,
      }),
    ).resolves.toEqual({ generators: [] });
  });

  it("refuses a write that needs a module which is not loaded", async () => {
    const guild = { id: GUILD_ID, ownerId: OWNER_ID, members: { fetch: vi.fn() } };
    container.client = {
      guilds: { cache: new Map([[GUILD_ID, guild]]) },
    } as any;
    container.stores = {
      get: vi.fn(() => ({ loaded: () => [], get: () => undefined })),
    } as any;

    const handler = getRpcHandler("guild.tempvc.generators.set");
    await expect(
      handler!({
        id: "req",
        action: "guild.tempvc.generators.set",
        guildId: GUILD_ID,
        actorId: OWNER_ID,
        data: { channelId: TARGET_ID, name: "Gaming {}" },
      }),
    ).rejects.toMatchObject({
      message: "The tempvc module is not loaded",
      code: "MODULE_NOT_LOADED",
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { PermissionFlagsBits } from "discord.js";
import { container } from "#lib/services.js";
import { rpcRouter, type RpcActionName } from "@lumi/contracts/rpc";
import { PermitResolver } from "#lib/permissions/PermitResolver.js";
import { dispatchRpc } from "#lib/rpc/dispatch.js";
import { requireGuildId, requireGuildManager } from "#lib/rpc/implement.js";
import { getRpcHandler, registerRpcHandlers } from "#lib/rpc/registry.js";
import { repositoryCache } from "#lib/cache/CacheStore.js";
import { FakeDiscordRestPort } from "#lib/discord/fake-rest-port.js";

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

const ManageGuildBit = PermissionFlagsBits.ManageGuild.toString();
const AdministratorBit = PermissionFlagsBits.Administrator.toString();

function everyoneRole(permissions = "0") {
  return { id: GUILD_ID, permissions };
}

function memberWith(roleIds: string[]) {
  return { roles: roleIds };
}

function mockLogger() {
  container.logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as any;
}

/**
 * True for the shape the real `DiscordRestAdapter` already normalizes to
 * `null` (404, or the curated "Unknown Guild"/"Unknown Member" JSON codes) -
 * the port's contract is that a confirmed-absent lookup never reaches
 * `checkGuildManagerRest` as a rejection, so an error shaped like one is
 * modeled here as an unseeded (absent) target, not a port-level failure.
 */
function isConfirmedAbsentLike(err: Error & { code?: number; status?: number }): boolean {
  return err.status === 404 || err.code === 10004 || err.code === 10007;
}

/** Wires `container.discordRest` to answer the guild/member lookups `checkGuildManagerRest` calls. */
function mockRest(opts: {
  guild?: { owner_id: string; roles: { id: string; permissions: string }[] } | null;
  guildError?: Error;
  member?: unknown | Error;
}): FakeDiscordRestPort {
  const fake = new FakeDiscordRestPort();
  if (opts.guildError && !isConfirmedAbsentLike(opts.guildError)) {
    fake.failNextWith("fetchGuild", opts.guildError);
  } else if (opts.guild) {
    fake.seedGuild({ id: GUILD_ID, ...opts.guild } as any);
  }
  if (opts.member instanceof Error) {
    if (!isConfirmedAbsentLike(opts.member)) fake.failNextWith("fetchMember", opts.member);
  } else if (opts.member !== undefined) {
    fake.seedMember(GUILD_ID, { user: { id: ACTOR_ID }, ...(opts.member as object) } as any);
  }
  (container as any).discordRest = fake;
  return fake;
}

/** Minimal `DiscordRestPort` stub for tests that just need `guildManager` auth to pass for `ownerId`. */
function ownerOnlyRest(guildId: string, ownerId: string): FakeDiscordRestPort {
  const fake = new FakeDiscordRestPort();
  fake.seedGuild({
    id: guildId,
    owner_id: ownerId,
    roles: [{ id: guildId, permissions: "0" }],
  } as any);
  return fake;
}

function mockValkeyCacheMiss() {
  (container as any).valkey = { get: vi.fn().mockResolvedValue(null), setex: vi.fn() };
}

describe("RPC guild access under Discord API failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger();
    repositoryCache.clear();
    mockValkeyCacheMiss();

    mockRest({
      guild: { owner_id: OWNER_ID, roles: [everyoneRole()] },
      member: memberWith([]),
    });
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

    it("fails when the guild is not found over REST", async () => {
      mockRest({ guild: null });

      await expect(requireGuildManager(GUILD_ID, ACTOR_ID)).rejects.toMatchObject({
        message: "Guild not found in bot cache",
        code: "GUILD_NOT_FOUND",
      });
    });

    it("reports a guild-lookup 5xx as a retryable failure, not GuildNotFound", async () => {
      mockRest({ guildError: discordApiError("Service Unavailable", 0, 503) });

      await expect(requireGuildManager(GUILD_ID, ACTOR_ID)).rejects.toMatchObject({
        code: "HANDLER_ERROR",
        retryable: true,
        message: expect.not.stringMatching(/Service Unavailable/),
      });
    });

    it("lets the guild owner through without a member lookup", async () => {
      const fake = mockRest({
        guild: { owner_id: OWNER_ID, roles: [everyoneRole()] },
      });
      const fetchMember = vi.spyOn(fake, "fetchMember");

      await expect(requireGuildManager(GUILD_ID, OWNER_ID)).resolves.toBe(
        OWNER_ID,
      );
      expect(fetchMember).not.toHaveBeenCalled();
    });

    it("accepts a member holding ManageGuild", async () => {
      mockRest({
        guild: { owner_id: OWNER_ID, roles: [everyoneRole(ManageGuildBit)] },
        member: memberWith([]),
      });

      await expect(requireGuildManager(GUILD_ID, ACTOR_ID)).resolves.toBe(
        ACTOR_ID,
      );
    });

    it("accepts a member holding Administrator via an assigned role", async () => {
      mockRest({
        guild: {
          owner_id: OWNER_ID,
          roles: [everyoneRole(), { id: "role-1", permissions: AdministratorBit }],
        },
        member: memberWith(["role-1"]),
      });

      await expect(requireGuildManager(GUILD_ID, ACTOR_ID)).resolves.toBe(
        ACTOR_ID,
      );
    });

    it("denies a member holding neither permission", async () => {
      mockRest({
        guild: { owner_id: OWNER_ID, roles: [everyoneRole()] },
        member: memberWith([]),
      });

      await expect(requireGuildManager(GUILD_ID, ACTOR_ID)).rejects.toMatchObject({
        message: "Missing ManageGuild permission",
        code: "FORBIDDEN",
      });
    });

    it("denies when the member is no longer in the guild", async () => {
      mockRest({
        guild: { owner_id: OWNER_ID, roles: [everyoneRole()] },
        member: undefined,
      });

      await expect(requireGuildManager(GUILD_ID, ACTOR_ID)).rejects.toThrow(
        "Missing ManageGuild permission",
      );
    });

    it("denies a confirmed-absent member (404 unknown member) rather than leaking", async () => {
      mockRest({
        guild: { owner_id: OWNER_ID, roles: [everyoneRole()] },
        member: DiscordErrors.unknownMember(),
      });

      await expect(requireGuildManager(GUILD_ID, ACTOR_ID)).rejects.toThrow(
        "Missing ManageGuild permission",
      );
    });

    it.each([
      ["a 403 missing access", DiscordErrors.missingAccess],
      ["a 429 rate limit", DiscordErrors.rateLimited],
      ["a connection timeout", DiscordErrors.timeout],
    ])(
      "reports %s as a retryable failure without leaking the Discord message",
      async (_label, makeError) => {
        const error = makeError();
        mockRest({
          guild: { owner_id: OWNER_ID, roles: [everyoneRole()] },
          member: error,
        });

        const rejection = await requireGuildManager(GUILD_ID, ACTOR_ID).catch(
          (err: unknown) => err,
        );
        expect(rejection).toMatchObject({ code: "HANDLER_ERROR", retryable: true });
        expect((rejection as Error).message).not.toBe(error.message);
        expect((rejection as Error).message).not.toBe(
          "Missing ManageGuild permission",
        );
      },
    );

    it("fails closed for an owner id that does not match the actor", async () => {
      mockRest({
        guild: { owner_id: OWNER_ID, roles: [everyoneRole()] },
        member: DiscordErrors.unknownMember(),
      });

      await expect(
        requireGuildManager(GUILD_ID, "999999999999999999"),
      ).rejects.toThrow("Missing ManageGuild permission");
    });
  });

});

describe("dispatchRpc error shaping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger();
    repositoryCache.clear();
    mockValkeyCacheMiss();

    container.client = {
      application: { owner: { id: OWNER_ID } },
      guilds: { cache: new Map() },
    } as any;
    // No guild seeded: `checkGuildManagerRest` sees this as guild-not-found,
    // the same confirmed-absent behavior a real "Unknown Guild" reject maps to.
    (container as any).discordRest = new FakeDiscordRestPort();

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
      retryable: false,
      retryAfterMs: undefined,
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
    expect((res as any).retryable).toBe(false);
    expect(res.data).toBeUndefined();
  });

  it("carries a CodedRpcError's retryable/retryAfterMs override onto the envelope", async () => {
    const { CodedRpcError, RpcFailureCodes } = await import("@lumi/contracts/rpc");
    failWhoAmI(
      new CodedRpcError(RpcFailureCodes.HandlerError, "try again shortly", {
        retryable: true,
        retryAfterMs: 2000,
      }),
    );

    const res = await dispatchRpc({
      id: "req-4b",
      action: "auth.whoami",
      actorId: ACTOR_ID,
    });

    expect(res.ok).toBe(false);
    expect((res as any).retryable).toBe(true);
    expect((res as any).retryAfterMs).toBe(2000);
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
      retryable: false,
      retryAfterMs: undefined,
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
    repositoryCache.clear();
    mockValkeyCacheMiss();

    guild = { id: GUILD_ID, ownerId: OWNER_ID, members: { fetch: vi.fn() } };
    container.client = {
      guilds: { cache: new Map([[GUILD_ID, guild]]) },
    } as any;
    (container as any).discordRest = ownerOnlyRest(GUILD_ID, OWNER_ID);

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
    repositoryCache.clear();
    mockValkeyCacheMiss();
    const guild = { id: GUILD_ID, ownerId: OWNER_ID, members: { fetch: vi.fn() } };
    container.client = {
      guilds: { cache: new Map([[GUILD_ID, guild]]) },
    } as any;
    (container as any).discordRest = ownerOnlyRest(GUILD_ID, OWNER_ID);
    (container as any).moduleStore = { get: () => undefined, loaded: () => [] };
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
    repositoryCache.clear();
    mockValkeyCacheMiss();
    const guild = { id: GUILD_ID, ownerId: OWNER_ID, members: { fetch: vi.fn() } };
    container.client = {
      guilds: { cache: new Map([[GUILD_ID, guild]]) },
    } as any;
    (container as any).discordRest = ownerOnlyRest(GUILD_ID, OWNER_ID);
    (container as any).moduleStore = { get: () => undefined, loaded: () => [] };

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

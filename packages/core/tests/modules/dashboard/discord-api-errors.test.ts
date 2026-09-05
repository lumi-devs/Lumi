import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import {
  cachedGuild,
  requireGuildId,
  requireGuildManager,
} from "#modules/dashboard/lib/helpers.js";
import { dispatchRpc, registerRpcHandler, rpcHandlers } from "#lib/rpc/dispatch.js";

const GUILD_ID = "123456789012345678";
const OWNER_ID = "111111111111111111";
const ACTOR_ID = "222222222222222222";

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

describe("dashboard RPC guild access under Discord API failures", () => {
  let guild: any;

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

      await expect(requireGuildManager(GUILD_ID, ACTOR_ID)).rejects.toThrow(
        "Guild not found in bot cache",
      );
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

      await expect(requireGuildManager(GUILD_ID, ACTOR_ID)).rejects.toThrow(
        "Missing ManageGuild permission",
      );
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
  const ACTION = "test.action";

  beforeEach(() => {
    vi.clearAllMocks();
    rpcHandlers.delete(ACTION);

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    (container as any).db = {
      config: { isDashboardEnabled: vi.fn().mockResolvedValue(true) },
    };
  });

  it("reports an unregistered action without throwing", async () => {
    const res = await dispatchRpc({ id: "req-1", action: "nope.missing" });

    expect(res.ok).toBe(false);
    expect(res.error).toContain("No handler registered");
    expect(res.id).toBe("req-1");
  });

  it("refuses a guild whose dashboard is switched off", async () => {
    registerRpcHandler(ACTION, () => ({ reached: true }));
    (container.db.config.isDashboardEnabled as any).mockResolvedValue(false);

    const res = await dispatchRpc({
      id: "req-2",
      action: ACTION,
      guildId: GUILD_ID,
    });

    expect(res).toEqual({ id: "req-2", ok: false, error: "Dashboard disabled" });
  });

  it("wraps a successful handler result", async () => {
    registerRpcHandler(ACTION, () => ({ value: 42 }));

    const res = await dispatchRpc({ id: "req-3", action: ACTION });

    expect(res).toEqual({ id: "req-3", ok: true, data: { value: 42 } });
  });

  it("converts a thrown handler error into a failed response carrying no data", async () => {
    registerRpcHandler(ACTION, () => {
      throw new Error("A permit named mods already exists.");
    });

    const res = await dispatchRpc({ id: "req-4", action: ACTION });

    expect(res.ok).toBe(false);
    expect(res.error).toBe("A permit named mods already exists.");
    expect(res.data).toBeUndefined();
  });

  it("logs the failure for operators while still answering the caller", async () => {
    registerRpcHandler(ACTION, () => {
      throw new Error("boom");
    });

    const res = await dispatchRpc({ id: "req-5", action: ACTION });

    expect(res.ok).toBe(false);
    expect(container.logger.error).toHaveBeenCalled();
  });

  it("answers a Discord API rejection from inside a handler", async () => {
    registerRpcHandler(ACTION, () => {
      throw DiscordErrors.unknownGuild();
    });

    const res = await dispatchRpc({ id: "req-6", action: ACTION });

    expect(res.ok).toBe(false);
    expect(res.error).toBe("Unknown Guild");
  });

  it("keeps the correlation id of the request on the response", async () => {
    registerRpcHandler(ACTION, () => {
      throw new Error("boom");
    });

    const res = await dispatchRpc({ id: "correlation-xyz", action: ACTION });

    expect(res.id).toBe("correlation-xyz");
  });
});

import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@lumi/lib/services.js";
import { DiscordRestAdapter } from "@lumi/lib/discord/rest-adapter.js";
import { DiscordRestApiError } from "@lumi/lib/discord/rest-port.js";

function discordApiError(message: string, code: number, status: number) {
  const err = new Error(message) as Error & { code: number; status: number };
  err.code = code;
  err.status = status;
  return err;
}

const GUILD_ID = "123456789012345678";
const USER_ID = "222222222222222222";

describe("DiscordRestAdapter", () => {
  let get: ReturnType<typeof vi.fn>;
  let patch: ReturnType<typeof vi.fn>;
  let del: ReturnType<typeof vi.fn>;
  let adapter: DiscordRestAdapter;

  beforeEach(() => {
    get = vi.fn();
    patch = vi.fn();
    del = vi.fn();
    container.client = { rest: { get, patch, delete: del } } as any;
    adapter = new DiscordRestAdapter();
  });

  describe("fetchGuild", () => {
    it("returns the guild on success", async () => {
      const guild = { id: GUILD_ID } as any;
      get.mockResolvedValue(guild);

      await expect(adapter.fetchGuild(GUILD_ID)).resolves.toBe(guild);
    });

    it("maps a 404 to null", async () => {
      get.mockRejectedValue(discordApiError("Not Found", 0, 404));
      await expect(adapter.fetchGuild(GUILD_ID)).resolves.toBeNull();
    });

    it("maps Unknown Guild (10004) to null", async () => {
      get.mockRejectedValue(discordApiError("Unknown Guild", 10004, 404));
      await expect(adapter.fetchGuild(GUILD_ID)).resolves.toBeNull();
    });

    it("rethrows a non-absent failure as a DiscordRestApiError carrying the code", async () => {
      get.mockRejectedValue(discordApiError("Service Unavailable", 0, 503));

      const rejection = await adapter.fetchGuild(GUILD_ID).catch((err: unknown) => err);
      expect(rejection).toBeInstanceOf(DiscordRestApiError);
      expect((rejection as DiscordRestApiError).message).toBe("Service Unavailable");
      expect((rejection as DiscordRestApiError).status).toBe(503);
    });
  });

  describe("fetchMember", () => {
    it("returns the member on success", async () => {
      const member = { user: { id: USER_ID } } as any;
      get.mockResolvedValue(member);

      await expect(adapter.fetchMember(GUILD_ID, USER_ID)).resolves.toBe(member);
    });

    it("maps Unknown Member (10007) to null", async () => {
      get.mockRejectedValue(discordApiError("Unknown Member", 10007, 404));
      await expect(adapter.fetchMember(GUILD_ID, USER_ID)).resolves.toBeNull();
    });

    it("rethrows a rate limit as a DiscordRestApiError instead of treating it as absent", async () => {
      get.mockRejectedValue(discordApiError("You are being rate limited.", 0, 429));

      const rejection = await adapter
        .fetchMember(GUILD_ID, USER_ID)
        .catch((err: unknown) => err);
      expect(rejection).toBeInstanceOf(DiscordRestApiError);
      expect((rejection as DiscordRestApiError).code).toBe(0);
      expect((rejection as DiscordRestApiError).status).toBe(429);
    });
  });

  describe("removeBan", () => {
    it("deletes the ban", async () => {
      del.mockResolvedValue(undefined);
      await adapter.removeBan(GUILD_ID, USER_ID, "reason");
      expect(del).toHaveBeenCalledWith(expect.stringContaining(`/guilds/${GUILD_ID}/bans/${USER_ID}`), {
        reason: "reason",
      });
    });

    it("no-ops on Unknown Ban (10026)", async () => {
      del.mockRejectedValue(discordApiError("Unknown Ban", 10026, 404));
      await expect(adapter.removeBan(GUILD_ID, USER_ID, "reason")).resolves.toBeUndefined();
    });

    it("propagates 50013 (missing permissions) as a DiscordRestApiError", async () => {
      del.mockRejectedValue(discordApiError("Missing Permissions", 50013, 403));

      const rejection = await adapter
        .removeBan(GUILD_ID, USER_ID, "reason")
        .catch((err: unknown) => err);
      expect(rejection).toBeInstanceOf(DiscordRestApiError);
      expect((rejection as DiscordRestApiError).code).toBe(50013);
      expect((rejection as Error).message).toBe("Missing Permissions");
    });
  });

  describe("clearTimeout", () => {
    it("clears the timeout", async () => {
      patch.mockResolvedValue(undefined);
      await adapter.clearTimeout(GUILD_ID, USER_ID, "reason");
      expect(patch).toHaveBeenCalledWith(
        expect.stringContaining(`/guilds/${GUILD_ID}/members/${USER_ID}`),
        expect.objectContaining({ body: { communication_disabled_until: null } }),
      );
    });

    it("no-ops on Unknown Member (10007)", async () => {
      patch.mockRejectedValue(discordApiError("Unknown Member", 10007, 404));
      await expect(adapter.clearTimeout(GUILD_ID, USER_ID, "reason")).resolves.toBeUndefined();
    });

    it("propagates 50013 (missing permissions) as a DiscordRestApiError", async () => {
      patch.mockRejectedValue(discordApiError("Missing Permissions", 50013, 403));
      await expect(adapter.clearTimeout(GUILD_ID, USER_ID, "reason")).rejects.toThrow(
        "Missing Permissions",
      );
    });
  });

  describe("clearVoiceMute", () => {
    it("clears the server mute", async () => {
      patch.mockResolvedValue(undefined);
      await adapter.clearVoiceMute(GUILD_ID, USER_ID, "reason");
      expect(patch).toHaveBeenCalledWith(
        expect.stringContaining(`/guilds/${GUILD_ID}/members/${USER_ID}`),
        expect.objectContaining({ body: { mute: false } }),
      );
    });

    it("no-ops on Unknown Member (10007)", async () => {
      patch.mockRejectedValue(discordApiError("Unknown Member", 10007, 404));
      await expect(adapter.clearVoiceMute(GUILD_ID, USER_ID, "reason")).resolves.toBeUndefined();
    });

    it("propagates 50013 (missing permissions) as a DiscordRestApiError", async () => {
      patch.mockRejectedValue(discordApiError("Missing Permissions", 50013, 403));
      await expect(adapter.clearVoiceMute(GUILD_ID, USER_ID, "reason")).rejects.toThrow(
        "Missing Permissions",
      );
    });
  });
});

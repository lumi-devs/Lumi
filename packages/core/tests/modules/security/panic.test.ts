import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@lumi/lib/services.js";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import { Routes } from "discord-api-types/v10";
import { enterPanic, revertPanic } from "@lumi/application/services/security/panic.js";
import { repositoryCache } from "@lumi/lib/cache/cache-store.js";
import { FakeDiscordRestPort } from "@lumi/lib/discord/fake-rest-port.js";

const SendMessagesBit = PermissionFlagsBits.SendMessages.toString();

function setContainer(overrides: {
  db?: Record<string, unknown>;
  restGet?: ReturnType<typeof vi.fn>;
  restPatch?: ReturnType<typeof vi.fn>;
  restPut?: ReturnType<typeof vi.fn>;
  discordRest?: FakeDiscordRestPort;
}) {
  (container as any).discordRest = overrides.discordRest ?? new FakeDiscordRestPort();
  (container as any).valkey = {
    incr: vi.fn(),
    expire: vi.fn(),
    set: vi.fn(),
    exists: vi.fn().mockResolvedValue(0),
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn(),
  };
  (container as any).db = {
    ...overrides.db,
  };
  (container as any).client = {
    rest: {
      get: overrides.restGet ?? vi.fn().mockRejectedValue(new Error("unexpected GET")),
      patch: overrides.restPatch ?? vi.fn().mockResolvedValue(undefined),
      put: overrides.restPut ?? vi.fn().mockResolvedValue(undefined),
    },
  };
  (container as any).logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  repositoryCache.clear();
});

describe("enterPanic / revertPanic", () => {
  it(
    "pauses invites, locks matching text channels, and snapshots prior overwrites",
    async () => {
      const GUILD_ID = "g-panic";
      const restGet = vi.fn().mockImplementation((route: string) => {
        if (route === `/guilds/${GUILD_ID}/channels`) {
          return Promise.resolve([
            { id: "c1", type: ChannelType.GuildText, permission_overwrites: [] },
            { id: "v1", type: ChannelType.GuildVoice, permission_overwrites: [] },
          ]);
        }
        return Promise.reject(new Error(`Unexpected route: ${route}`));
      });
      const restPatch = vi.fn().mockResolvedValue(undefined);
      const restPut = vi.fn().mockResolvedValue(undefined);
      const savePanicState = vi.fn().mockResolvedValue(undefined);
      const getPanicState = vi.fn().mockResolvedValue(null);
      const discordRest = new FakeDiscordRestPort();
      discordRest.seedGuild({ id: GUILD_ID, features: [] } as any);

      setContainer({
        db: { security: { savePanicState, getPanicState } },
        restGet,
        restPatch,
        restPut,
        discordRest,
      });

      const result = await enterPanic(GUILD_ID, "actor-1", []);

      expect(restPatch).toHaveBeenCalledWith(Routes.guild(GUILD_ID), {
        body: { features: ["INVITES_DISABLED"] },
      });
      expect(restPut).toHaveBeenCalledWith(
        Routes.channelPermission("c1", GUILD_ID),
        expect.objectContaining({
          body: { id: GUILD_ID, type: 0, allow: "0", deny: SendMessagesBit },
          reason: expect.stringContaining("actor-1"),
        }),
      );
      // The voice channel isn't a GuildText/GuildAnnouncement channel, so only
      // c1 is a candidate and gets locked.
      expect(result).toEqual({
        invitesPaused: true,
        lockedCount: 1,
        skippedCount: 0,
      });
      expect(savePanicState).toHaveBeenCalledWith({
        guildId: GUILD_ID,
        actorId: "actor-1",
        invitesPaused: true,
        lockedChannels: { c1: null },
      });
    },
    10000,
  );

  it(
    "restores every snapshotted channel overwrite and resumes invites",
    async () => {
      const GUILD_ID = "g-panic";
      const restGet = vi.fn().mockImplementation((route: string) => {
        if (route === `/guilds/${GUILD_ID}/channels`) {
          return Promise.resolve([
            { id: "c1", type: ChannelType.GuildText, permission_overwrites: [] },
          ]);
        }
        return Promise.reject(new Error(`Unexpected route: ${route}`));
      });
      const restPatch = vi.fn().mockResolvedValue(undefined);
      const restPut = vi.fn().mockResolvedValue(undefined);
      const getPanicState = vi.fn().mockResolvedValue({
        guildId: GUILD_ID,
        actorId: "actor-1",
        invitesPaused: true,
        lockedChannels: { c1: true },
      });
      const clearPanicState = vi.fn().mockResolvedValue(undefined);
      const discordRest = new FakeDiscordRestPort();
      discordRest.seedGuild({ id: GUILD_ID, features: ["INVITES_DISABLED"] } as any);

      setContainer({
        db: { security: { getPanicState, clearPanicState } },
        restGet,
        restPatch,
        restPut,
        discordRest,
      });

      const result = await revertPanic(GUILD_ID);

      expect(restPatch).toHaveBeenCalledWith(Routes.guild(GUILD_ID), {
        body: { features: [] },
      });
      expect(restPut).toHaveBeenCalledWith(
        Routes.channelPermission("c1", GUILD_ID),
        expect.objectContaining({
          body: { id: GUILD_ID, type: 0, allow: SendMessagesBit, deny: "0" },
          reason: "Panic mode reverted",
        }),
      );
      expect(clearPanicState).toHaveBeenCalledWith(GUILD_ID);
      expect(result).toEqual({ restoredCount: 1, restoredStructure: null });
    },
    10000,
  );

  it("returns null when there is no saved panic state to revert", async () => {
    const getPanicState = vi.fn().mockResolvedValue(null);
    setContainer({ db: { security: { getPanicState } } });

    const result = await revertPanic("g1");

    expect(result).toBeNull();
  });
});

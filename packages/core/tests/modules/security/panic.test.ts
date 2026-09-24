import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import { ChannelType } from "discord.js";
import { enterPanic, revertPanic } from "#modules/security/services/panic.js";

function setContainer(overrides: {
  redis?: Record<string, unknown>;
  db?: Record<string, unknown>;
}) {
  (container as any).redis = {
    incr: vi.fn(),
    expire: vi.fn(),
    set: vi.fn(),
    exists: vi.fn().mockResolvedValue(0),
    ...overrides.redis,
  };
  (container as any).db = {
    ...overrides.db,
  };
  (container as any).logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
}

const guild = {
  id: "g1",
  ownerId: "owner-1",
  members: { fetch: vi.fn(), ban: vi.fn() },
} as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("enterPanic / revertPanic", () => {
  it(
    "pauses invites, locks matching text channels, and snapshots prior overwrites",
    async () => {
      const disableInvites = vi.fn().mockResolvedValue(undefined);
      const editC1 = vi.fn().mockResolvedValue(undefined);
      const everyone = { id: "everyone-id" };
      const channel1 = {
        id: "c1",
        type: ChannelType.GuildText,
        permissionOverwrites: {
          cache: { get: vi.fn().mockReturnValue(undefined) },
          edit: editC1,
        },
      };
      const voiceChannel = { id: "v1", type: ChannelType.GuildVoice };
      const savePanicState = vi.fn().mockResolvedValue(undefined);
      const getPanicState = vi.fn().mockResolvedValue(null);
      const panicGuild = {
        id: "g-panic",
        disableInvites,
        channels: {
          cache: new Map([
            ["c1", channel1],
            ["v1", voiceChannel],
          ]),
        },
        roles: { everyone },
      } as any;

      setContainer({ db: { security: { savePanicState, getPanicState } } });

      const result = await enterPanic(panicGuild, "actor-1", []);

      expect(disableInvites).toHaveBeenCalledWith(true);
      expect(editC1).toHaveBeenCalledWith(
        everyone,
        { SendMessages: false },
        expect.objectContaining({ reason: expect.stringContaining("actor-1") }),
      );
      // The voice channel isn't a GuildText/GuildAnnouncement channel, so only
      // c1 is a candidate and gets locked.
      expect(result).toEqual({
        invitesPaused: true,
        lockedCount: 1,
        skippedCount: 0,
      });
      expect(savePanicState).toHaveBeenCalledWith({
        guildId: "g-panic",
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
      const disableInvites = vi.fn().mockResolvedValue(undefined);
      const editC1 = vi.fn().mockResolvedValue(undefined);
      const everyone = { id: "everyone-id" };
      const channel1 = {
        id: "c1",
        permissionOverwrites: { edit: editC1 },
      };
      const getPanicState = vi.fn().mockResolvedValue({
        guildId: "g-panic",
        actorId: "actor-1",
        invitesPaused: true,
        lockedChannels: { c1: true },
      });
      const clearPanicState = vi.fn().mockResolvedValue(undefined);
      const panicGuild = {
        id: "g-panic",
        disableInvites,
        channels: { cache: new Map([["c1", channel1]]) },
        roles: { everyone },
      } as any;

      setContainer({
        db: { security: { getPanicState, clearPanicState } },
      });

      const result = await revertPanic(panicGuild);

      expect(disableInvites).toHaveBeenCalledWith(false);
      expect(editC1).toHaveBeenCalledWith(
        everyone,
        { SendMessages: true },
        expect.objectContaining({ reason: "Panic mode reverted" }),
      );
      expect(clearPanicState).toHaveBeenCalledWith("g-panic");
      expect(result).toEqual({ restoredCount: 1, restoredStructure: null });
    },
    10000,
  );

  it("returns null when there is no saved panic state to revert", async () => {
    const getPanicState = vi.fn().mockResolvedValue(null);
    setContainer({ db: { security: { getPanicState } } });

    const result = await revertPanic(guild);

    expect(result).toBeNull();
  });
});

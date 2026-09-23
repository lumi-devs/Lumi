import { describe, it, expect, vi, beforeEach } from "bun:test";
import { ChannelType } from "discord.js";
import { SecurityUtility } from "#modules/security/utilities/SecurityUtility.js";
import { MaxAttempts, type CaptchaState } from "#modules/security/services/captcha.js";

function makeMultiMock(count: number) {
  return {
    incr: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([[null, count]]),
  };
}

function makeService(overrides: {
  redis?: Record<string, unknown>;
  db?: Record<string, unknown>;
}) {
  const service = Object.create(SecurityUtility.prototype) as SecurityUtility;
  Object.defineProperty(service, "redis", {
    value: {
      incr: vi.fn(),
      expire: vi.fn(),
      set: vi.fn(),
      exists: vi.fn().mockResolvedValue(0),
      multi: vi.fn(() => makeMultiMock(1)),
      ...overrides.redis,
    },
  });
  Object.defineProperty(service, "db", {
    value: overrides.db ?? {},
  });
  Object.defineProperty(service, "logger", {
    value: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  });
  return service;
}

const guild = {
  id: "g1",
  ownerId: "owner-1",
  members: { fetch: vi.fn(), ban: vi.fn() },
} as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SecurityUtility.enterPanic / revertPanic", () => {
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

      const service = makeService({ db: { security: { savePanicState, getPanicState } } });

      const result = await service.enterPanic(panicGuild, "actor-1", []);

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

      const service = makeService({
        db: { security: { getPanicState, clearPanicState } },
      });

      const result = await service.revertPanic(panicGuild);

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
    const service = makeService({ db: { security: { getPanicState } } });

    const result = await service.revertPanic(guild);

    expect(result).toBeNull();
  });
});

describe("SecurityUtility.grantVerified", () => {
  it("grants the verified role and strips the pending role", async () => {
    const roleSet = vi.fn().mockResolvedValue(undefined);
    const member = {
      roles: {
        set: roleSet,
        cache: new Map([
          ["pending-role", {}],
          ["other-role", {}],
        ]),
      },
    };
    const fetch = vi.fn().mockResolvedValue(member);
    const getAllModuleConfig = vi.fn().mockResolvedValue({
      verification_enabled: true,
      verified_role_id: "verified-role",
      verification_pending_role_id: "pending-role",
    });
    const verifyGuild = { id: "g1", members: { fetch } } as any;
    const service = makeService({ db: { config: { getAllModuleConfig } } });

    const result = await service.grantVerified(verifyGuild, "u1");

    expect(roleSet).toHaveBeenCalledTimes(1);
    const [rolesArg, reasonArg] = roleSet.mock.calls[0] as [string[], string];
    expect(new Set(rolesArg)).toEqual(new Set(["other-role", "verified-role"]));
    expect(reasonArg).toBe("Verification passed");
    expect(result).toBe(true);
  });

  it("denies verification when the guild has no verified role configured", async () => {
    const fetch = vi.fn();
    const getAllModuleConfig = vi.fn().mockResolvedValue({});
    const verifyGuild = { id: "g1", members: { fetch } } as any;
    const service = makeService({ db: { config: { getAllModuleConfig } } });

    const result = await service.grantVerified(verifyGuild, "u1");

    expect(result).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("SecurityUtility.advanceChallenge", () => {
  function makeChallengeRedis(initial: CaptchaState) {
    let stored: string | null = JSON.stringify(initial);
    const get = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return stored;
    });
    const set = vi.fn((_key: string, value: string) => {
      stored = value;
      return Promise.resolve();
    });
    return {
      get,
      set,
      read: (): CaptchaState | null => (stored ? JSON.parse(stored) : null),
    };
  }

  it("serializes two concurrent wrong clicks so neither attempts decrement is lost", async () => {
    const initial: CaptchaState = {
      sequence: [0, 1, 2, 3],
      buttons: [0, 1, 2, 3, 4, 5, 6, 7],
      progress: 0,
      attempts: MaxAttempts,
      expiresAt: Date.now() + 60_000,
    };
    const redis = makeChallengeRedis(initial);
    const service = makeService({ redis });

    const [r1, r2] = await Promise.all([
      service.advanceChallenge("g1", "u1", 7),
      service.advanceChallenge("g1", "u1", 7),
    ]);

    expect(r1?.outcome).toBe("wrong");
    expect(r2?.outcome).toBe("wrong");
    expect(redis.read()?.attempts).toBe(MaxAttempts - 2);
  });

  it("returns null when there is no active challenge to advance", async () => {
    const get = vi.fn().mockResolvedValue(null);
    const service = makeService({ redis: { get } });

    const result = await service.advanceChallenge("g1", "u1", 0);

    expect(result).toBeNull();
  });
});

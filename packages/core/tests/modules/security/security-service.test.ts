import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { ChannelType } from "discord.js";
import { SecurityService } from "#modules/security/services/SecurityService.js";
import { QuarantineAction } from "#lib/moderation/QuarantineAction.js";
import { logToChannel } from "#lib/moderation/log.js";

vi.mock("#lib/moderation/QuarantineAction.js", () => ({
  QuarantineAction: { apply: vi.fn() },
}));

vi.mock("#lib/moderation/log.js", () => ({
  logToChannel: vi.fn(),
}));

const baseConfig = {
  enabled: true,
  windowSeconds: 60,
  limits: {
    ban: 3,
    kick: 3,
    channel_delete: 2,
    role_delete: 2,
    webhook_create: 2,
  },
  response: "quarantine" as const,
  trustedRoleIds: [] as string[],
};

function makeService(overrides: {
  redis?: Record<string, ReturnType<typeof vi.fn>>;
  db?: Record<string, unknown>;
}) {
  const service = Object.create(SecurityService.prototype) as SecurityService;
  Object.defineProperty(service, "redis", {
    value: {
      incr: vi.fn(),
      expire: vi.fn(),
      set: vi.fn(),
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
  (container as any).client = { user: { id: "bot-1" } };
});

describe("SecurityService.loadAntiNukeConfig", () => {
  it("parses config with defaults and trusted role list", async () => {
    const service = makeService({
      db: {
        config: {
          getAllModuleConfig: vi.fn().mockResolvedValue({
            antinuke_enabled: true,
            max_bans: 10,
            trusted_role_ids: "111111111111111111, 222222222222222222",
          }),
        },
      },
    });

    const config = await service.loadAntiNukeConfig("g1");
    expect(config.enabled).toBe(true);
    expect(config.limits.ban).toBe(10);
    expect(config.limits.kick).toBe(5);
    expect(config.windowSeconds).toBe(60);
    expect(config.response).toBe("quarantine");
    expect(config.trustedRoleIds).toEqual([
      "111111111111111111",
      "222222222222222222",
    ]);
  });
});

describe("SecurityService.recordAction", () => {
  it("stays silent under the limit and sets the window expiry once", async () => {
    const incr = vi.fn().mockResolvedValue(1);
    const expire = vi.fn();
    const service = makeService({ redis: { incr, expire } });

    const result = await service.recordAction(guild, "u1", "ban", baseConfig);
    expect(result).toBeNull();
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it("trips once when the limit is exceeded", async () => {
    const incr = vi.fn().mockResolvedValue(4);
    const set = vi.fn().mockResolvedValue("OK");
    const service = makeService({ redis: { incr, set } });

    const result = await service.recordAction(guild, "u1", "ban", baseConfig);
    expect(result).toBe(4);
    expect(set).toHaveBeenCalledWith(
      expect.stringContaining("tripped"),
      expect.any(String),
      "EX",
      expect.any(Number),
      "NX",
    );
  });

  it("does not re-trip while the cooldown key exists", async () => {
    const incr = vi.fn().mockResolvedValue(5);
    const set = vi.fn().mockResolvedValue(null);
    const service = makeService({ redis: { incr, set } });

    const result = await service.recordAction(guild, "u1", "ban", baseConfig);
    expect(result).toBeNull();
  });
});

describe("SecurityService.isExempt", () => {
  it("exempts the guild owner and the bot itself", async () => {
    const service = makeService({});
    await expect(service.isExempt(guild, "owner-1", baseConfig)).resolves.toBe(
      true,
    );
    await expect(service.isExempt(guild, "bot-1", baseConfig)).resolves.toBe(
      true,
    );
  });

  it("exempts members holding a trusted role", async () => {
    const service = makeService({});
    guild.members.fetch.mockResolvedValue({
      roles: { cache: new Map([["r-trusted", {}]]) },
    });
    const config = { ...baseConfig, trustedRoleIds: ["r-trusted"] };
    await expect(service.isExempt(guild, "u1", config)).resolves.toBe(true);
  });

  it("does not exempt regular members", async () => {
    const service = makeService({});
    guild.members.fetch.mockResolvedValue({
      roles: { cache: new Map() },
    });
    const config = { ...baseConfig, trustedRoleIds: ["r-trusted"] };
    await expect(service.isExempt(guild, "u1", config)).resolves.toBe(false);
  });
});

describe("SecurityService.respond", () => {
  it("quarantines the executor when configured", async () => {
    const service = makeService({});
    const member = { id: "u1" };
    guild.members.fetch.mockResolvedValue(member);

    await service.respond(guild, "u1", "ban", 4, baseConfig);
    expect(QuarantineAction.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        guild,
        targetMember: member,
        reason: expect.stringContaining("Anti-nuke"),
      }),
    );
  });

  it("falls back to a logged alert case when response is log", async () => {
    const createModerationCase = vi
      .fn()
      .mockResolvedValue({ caseNumber: 7 });
    const service = makeService({
      db: { moderation: { createModerationCase } },
    });

    await service.respond(guild, "u1", "kick", 4, {
      ...baseConfig,
      response: "log",
    });

    expect(createModerationCase).toHaveBeenCalledWith(
      expect.objectContaining({ action: "antinuke_alert" }),
    );
    expect(logToChannel).toHaveBeenCalledWith(
      "g1",
      expect.any(String),
      expect.any(Number),
      "u1",
      expect.anything(),
      expect.stringContaining("Anti-nuke"),
      7,
      "security",
    );
  });
});

describe("SecurityService.enterPanic / revertPanic", () => {
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

      const service = makeService({ db: { security: { savePanicState } } });

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
      expect(result).toEqual({ restoredCount: 1 });
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

describe("SecurityService.applyGateAction", () => {
  it("kicks the member, creates a case, and logs to channel on the kick action", async () => {
    const kick = vi.fn().mockResolvedValue(undefined);
    const member = { id: "u1", kick };
    const fetch = vi.fn().mockResolvedValue(member);
    const createModerationCase = vi.fn().mockResolvedValue({ caseNumber: 9 });
    const gateGuild = { id: "g1", members: { fetch } } as any;

    const service = makeService({
      db: { moderation: { createModerationCase } },
    });

    const result = await service.applyGateAction(
      gateGuild,
      "u1",
      "kick",
      "Underage account",
    );

    expect(kick).toHaveBeenCalledWith("Underage account");
    expect(createModerationCase).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: "g1", userId: "u1", action: "kick" }),
    );
    expect(logToChannel).toHaveBeenCalledWith(
      "g1",
      expect.any(String),
      expect.any(Number),
      "u1",
      expect.anything(),
      "Underage account",
      9,
      "security",
    );
    expect(result).toBe(true);
  });

  it("applies quarantine without creating a moderation case directly", async () => {
    const member = { id: "u1" };
    const fetch = vi.fn().mockResolvedValue(member);
    const createModerationCase = vi.fn();
    const gateGuild = { id: "g1", members: { fetch } } as any;
    const service = makeService({
      db: { moderation: { createModerationCase } },
    });

    const result = await service.applyGateAction(
      gateGuild,
      "u1",
      "quarantine",
      "Raid join burst",
    );

    expect(QuarantineAction.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        guild: gateGuild,
        targetMember: member,
        reason: "Raid join burst",
      }),
    );
    expect(createModerationCase).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("returns false when the member can't be fetched (already left)", async () => {
    const fetch = vi.fn().mockResolvedValue(null);
    const gateGuild = { id: "g1", members: { fetch } } as any;
    const service = makeService({});

    const result = await service.applyGateAction(gateGuild, "u1", "kick", "Raid");

    expect(result).toBe(false);
  });
});

describe("SecurityService.grantVerified", () => {
  it("grants the verified role and strips the pending role", async () => {
    const roleAdd = vi.fn().mockResolvedValue(undefined);
    const roleRemove = vi.fn().mockResolvedValue(undefined);
    const member = {
      roles: {
        add: roleAdd,
        remove: roleRemove,
        cache: new Map([["pending-role", {}]]),
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

    expect(roleAdd).toHaveBeenCalledWith(
      "verified-role",
      "Verification passed",
    );
    expect(roleRemove).toHaveBeenCalledWith(
      "pending-role",
      "Verification passed",
    );
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

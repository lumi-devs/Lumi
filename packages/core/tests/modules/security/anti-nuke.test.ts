import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import {
  loadAntiNukeConfig,
  recordAction,
  isExempt,
  respond,
} from "#modules/security/services/anti-nuke.js";
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
    vanity_change: 1,
    dangerous_permission_grant: 1,
    quarantine_bypass: 1,
  },
  responses: {
    ban: "quarantine" as const,
    kick: "quarantine" as const,
    channel_delete: "quarantine" as const,
    role_delete: "quarantine" as const,
    webhook_create: "quarantine" as const,
    vanity_change: "quarantine" as const,
    dangerous_permission_grant: "quarantine" as const,
    quarantine_bypass: "quarantine" as const,
  },
  trustedRoleIds: [] as string[],
};

function makeMultiMock(count: number) {
  return {
    incr: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([[null, count]]),
  };
}

function setContainer(overrides: {
  redis?: Record<string, unknown>;
  db?: Record<string, unknown>;
}) {
  (container as any).redis = {
    incr: vi.fn(),
    expire: vi.fn(),
    set: vi.fn(),
    exists: vi.fn().mockResolvedValue(0),
    multi: vi.fn(() => makeMultiMock(1)),
    ...overrides.redis,
  };
  (container as any).db = {
    config: { getModuleConfig: vi.fn().mockResolvedValue(null) },
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
  (container as any).client = { user: { id: "bot-1" } };
  // `respond` -> `isImmuneToAutomatedAction` reads the immune-role
  // list off the real global container (not the container double set below).
  (container as any).db = {
    config: { getModuleConfig: vi.fn().mockResolvedValue(null) },
  };
});

describe("loadAntiNukeConfig", () => {
  it("parses config with defaults and trusted role list", async () => {
    setContainer({
      db: {
        config: {
          getAllModuleConfig: vi.fn().mockResolvedValue({
            antinuke_enabled: true,
            max_bans: 10,
            trusted_role_ids: ["111111111111111111", "222222222222222222"],
          }),
        },
      },
    });

    const config = await loadAntiNukeConfig("g1");
    expect(config.enabled).toBe(true);
    expect(config.limits.ban).toBe(10);
    expect(config.limits.kick).toBe(5);
    expect(config.windowSeconds).toBe(60);
    expect(config.responses.ban).toBe("quarantine");
    expect(config.responses.kick).toBe("quarantine");
    expect(config.trustedRoleIds).toEqual([
      "111111111111111111",
      "222222222222222222",
    ]);
  });

  it("defaults every kind to quarantine when unconfigured", async () => {
    setContainer({
      db: {
        config: {
          getAllModuleConfig: vi.fn().mockResolvedValue({
            antinuke_enabled: true,
          }),
        },
      },
    });

    const config = await loadAntiNukeConfig("g1");
    expect(config.responses.ban).toBe("quarantine");
    expect(config.responses.kick).toBe("quarantine");
    expect(config.responses.channel_delete).toBe("quarantine");
  });

  it("reads each action's response independently", async () => {
    setContainer({
      db: {
        config: {
          getAllModuleConfig: vi.fn().mockResolvedValue({
            antinuke_enabled: true,
            response_bans: "ban",
            response_kicks: "log",
          }),
        },
      },
    });

    const config = await loadAntiNukeConfig("g1");
    expect(config.responses.ban).toBe("ban");
    expect(config.responses.kick).toBe("log");
    expect(config.responses.channel_delete).toBe("quarantine");
  });
});

describe("recordAction", () => {
  it("stays silent under the limit and sets the window expiry once", async () => {
    const multiMock = makeMultiMock(1);
    const multi = vi.fn(() => multiMock);
    setContainer({ redis: { multi } });

    const result = await recordAction(guild, "u1", "ban", baseConfig);
    expect(result).toBeNull();
    expect(multiMock.expire).toHaveBeenCalledWith(
      expect.any(String),
      baseConfig.windowSeconds,
      "NX",
    );
  });

  it("trips once when the limit is exceeded", async () => {
    const multi = vi.fn(() => makeMultiMock(4));
    const set = vi.fn().mockResolvedValue("OK");
    setContainer({ redis: { multi, set } });

    const result = await recordAction(guild, "u1", "ban", baseConfig);
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
    const multi = vi.fn(() => makeMultiMock(5));
    const set = vi.fn().mockResolvedValue(null);
    setContainer({ redis: { multi, set } });

    const result = await recordAction(guild, "u1", "ban", baseConfig);
    expect(result).toBeNull();
  });
});

describe("isExempt", () => {
  it("exempts the guild owner and the bot itself", async () => {
    setContainer({});
    await expect(isExempt(guild, "owner-1", baseConfig)).resolves.toBe(
      true,
    );
    await expect(isExempt(guild, "bot-1", baseConfig)).resolves.toBe(
      true,
    );
  });

  it("exempts members holding a trusted role", async () => {
    setContainer({});
    guild.members.fetch.mockResolvedValue({
      roles: { cache: new Map([["r-trusted", {}]]) },
    });
    const config = { ...baseConfig, trustedRoleIds: ["r-trusted"] };
    await expect(isExempt(guild, "u1", config)).resolves.toBe(true);
  });

  it("does not exempt regular members", async () => {
    setContainer({});
    guild.members.fetch.mockResolvedValue({
      roles: { cache: new Map() },
    });
    const config = { ...baseConfig, trustedRoleIds: ["r-trusted"] };
    await expect(isExempt(guild, "u1", config)).resolves.toBe(false);
  });
});

describe("respond", () => {
  it("quarantines the executor when configured", async () => {
    setContainer({});
    const member = { id: "u1" };
    guild.members.fetch.mockResolvedValue(member);

    await respond(guild, "u1", "ban", 4, baseConfig);
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
    setContainer({
      db: { moderation: { createModerationCase } },
    });

    await respond(guild, "u1", "kick", 4, {
      ...baseConfig,
      responses: { ...baseConfig.responses, kick: "log" },
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

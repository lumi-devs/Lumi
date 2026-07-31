import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
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

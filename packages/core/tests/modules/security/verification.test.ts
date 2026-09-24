import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import {
  grantVerified,
  advanceChallenge,
} from "#modules/security/services/verification.js";
import { MaxAttempts, type CaptchaState } from "#modules/security/services/captcha.js";

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
    ...overrides.db,
  };
  (container as any).logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("grantVerified", () => {
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
    setContainer({ db: { config: { getAllModuleConfig } } });

    const result = await grantVerified(verifyGuild, "u1");

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
    setContainer({ db: { config: { getAllModuleConfig } } });

    const result = await grantVerified(verifyGuild, "u1");

    expect(result).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("advanceChallenge", () => {
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
    setContainer({ redis });

    const [r1, r2] = await Promise.all([
      advanceChallenge("g1", "u1", 7),
      advanceChallenge("g1", "u1", 7),
    ]);

    expect(r1?.outcome).toBe("wrong");
    expect(r2?.outcome).toBe("wrong");
    expect(redis.read()?.attempts).toBe(MaxAttempts - 2);
  });

  it("returns null when there is no active challenge to advance", async () => {
    const get = vi.fn().mockResolvedValue(null);
    setContainer({ redis: { get } });

    const result = await advanceChallenge("g1", "u1", 0);

    expect(result).toBeNull();
  });
});

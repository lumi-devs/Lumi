import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import { ChannelType } from "discord.js";
import { Routes } from "discord-api-types/v10";
import {
  grantVerified,
  advanceChallenge,
  postOrEditVerifyPanel,
} from "#modules/security/services/verification.js";
import { MaxAttempts, type CaptchaState } from "#modules/security/services/captcha.js";
import { repositoryCache } from "#lib/prisma/repositories/Repository.js";

vi.mock("@sapphire/plugin-i18next", () => ({
  fetchT: vi.fn().mockResolvedValue((key: string) => key),
}));

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
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn(),
    ...overrides.redis,
  };
  (container as any).db = {
    ...overrides.db,
  };
  (container as any).logger = {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repositoryCache.clear();
});

describe("grantVerified", () => {
  it("grants the verified role and strips the pending role", async () => {
    const restPatch = vi.fn().mockResolvedValue(undefined);
    const restGet = vi.fn().mockImplementation((route: string) => {
      if (route === "/guilds/g1/members/u1") {
        return Promise.resolve({
          roles: ["pending-role", "other-role"],
          user: { id: "u1" },
        });
      }
      return Promise.reject(new Error(`Unexpected route: ${route}`));
    });
    const getAllModuleConfig = vi.fn().mockResolvedValue({
      verification_enabled: true,
      verified_role_id: "verified-role",
      verification_pending_role_id: "pending-role",
    });
    setContainer({ db: { config: { getAllModuleConfig } } });
    (container as any).client = { rest: { get: restGet, patch: restPatch } };

    const result = await grantVerified("g1", "u1");

    expect(restPatch).toHaveBeenCalledTimes(1);
    const [route, { body, reason }] = restPatch.mock.calls[0] as [
      string,
      { body: { roles: string[] }; reason: string },
    ];
    expect(route).toBe(Routes.guildMember("g1", "u1"));
    // discord.js's own `GuildMemberRoleManager#cache` always includes the
    // guild's own id (the implicit `@everyone` role), so the real PATCH this
    // replaces always carried it too - reproduced here rather than dropped.
    expect(new Set(body.roles)).toEqual(new Set(["other-role", "verified-role", "g1"]));
    expect(reason).toBe("Verification passed");
    expect(result).toBe(true);
  });

  it("denies verification when the guild has no verified role configured", async () => {
    const restGet = vi.fn();
    const getAllModuleConfig = vi.fn().mockResolvedValue({});
    setContainer({ db: { config: { getAllModuleConfig } } });
    (container as any).client = { rest: { get: restGet, patch: vi.fn() } };

    const result = await grantVerified("g1", "u1");

    expect(result).toBe(false);
    expect(restGet).not.toHaveBeenCalled();
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

describe("postOrEditVerifyPanel", () => {
  const GUILD_ID = "g1";

  function baseConfig(overrides: Record<string, unknown> = {}) {
    return {
      verification_enabled: true,
      verified_role_id: "role1",
      ...overrides,
    };
  }

  /** Routes keyed as `"METHOD path"`, matching exactly what production code calls via `discord-api-types`' `Routes.*`. */
  function mockRest(routes: Record<string, unknown | Error>) {
    const dispatch = (method: string) =>
      vi.fn().mockImplementation((route: string) => {
        const key = `${method} ${route}`;
        const handler = routes[key];
        if (handler === undefined) {
          return Promise.reject(new Error(`Unexpected ${key}`));
        }
        if (handler instanceof Error) return Promise.reject(handler);
        return Promise.resolve(handler);
      });
    return {
      get: dispatch("GET"),
      post: dispatch("POST"),
      patch: dispatch("PATCH"),
      delete: dispatch("DELETE"),
    };
  }

  function setUp(opts: {
    config?: Record<string, unknown>;
    panel?: { channelId: string; messageId: string } | null;
    rest: Record<string, unknown | Error>;
  }) {
    const saveVerificationPanel = vi.fn().mockResolvedValue(undefined);
    setContainer({
      db: {
        config: {
          getAllModuleConfig: vi.fn().mockResolvedValue(opts.config ?? baseConfig()),
        },
        security: {
          getVerificationPanel: vi.fn().mockResolvedValue(opts.panel ?? null),
          saveVerificationPanel,
        },
      },
    });
    (container as any).client = { rest: mockRest(opts.rest) };
    return { saveVerificationPanel };
  }

  it("refuses when verification isn't enabled with a verified role set", async () => {
    setUp({ config: baseConfig({ verification_enabled: false }), rest: {} });

    await expect(
      postOrEditVerifyPanel(GUILD_ID, { channelId: "c1" }),
    ).rejects.toThrow("Turn on Verification and pick a Verified Role");
  });

  it("rejects a target channel that doesn't exist or isn't text-based", async () => {
    setUp({
      rest: {
        [`GET ${Routes.channel("c1")}`]: {
          id: "c1",
          guild_id: GUILD_ID,
          type: ChannelType.GuildCategory,
        },
        [`GET ${Routes.guild(GUILD_ID)}`]: { id: GUILD_ID },
      },
    });

    await expect(
      postOrEditVerifyPanel(GUILD_ID, { channelId: "c1" }),
    ).rejects.toThrow("That channel doesn't exist or isn't a text channel");
  });

  it("creates a channel and posts fresh when no panel exists yet", async () => {
    const { saveVerificationPanel } = setUp({
      rest: {
        [`POST ${Routes.guildChannels(GUILD_ID)}`]: { id: "new-channel" },
        [`GET ${Routes.guild(GUILD_ID)}`]: { id: GUILD_ID, preferred_locale: "en-US" },
        [`POST ${Routes.channelMessages("new-channel")}`]: { id: "msg1" },
      },
    });

    const result = await postOrEditVerifyPanel(GUILD_ID, { createChannel: true });

    expect(result).toEqual({
      channelId: "new-channel",
      messageId: "msg1",
      posted: true,
      edited: false,
      moved: false,
      createdChannel: true,
      oldMessageDeleted: false,
    });
    expect(saveVerificationPanel).toHaveBeenCalledWith({
      guildId: GUILD_ID,
      channelId: "new-channel",
      messageId: "msg1",
    });
  });

  it("edits the tracked message in place when the channel is unchanged and the message still exists", async () => {
    setUp({
      panel: { channelId: "c1", messageId: "old-msg" },
      rest: {
        [`GET ${Routes.channel("c1")}`]: {
          id: "c1",
          guild_id: GUILD_ID,
          type: ChannelType.GuildText,
        },
        [`GET ${Routes.guild(GUILD_ID)}`]: { id: GUILD_ID, preferred_locale: "en-US" },
        [`GET ${Routes.channelMessage("c1", "old-msg")}`]: { id: "old-msg" },
        [`PATCH ${Routes.channelMessage("c1", "old-msg")}`]: { id: "old-msg" },
      },
    });

    const result = await postOrEditVerifyPanel(GUILD_ID, { channelId: "c1" });

    expect(result).toEqual({
      channelId: "c1",
      messageId: "old-msg",
      posted: false,
      edited: true,
      moved: false,
      createdChannel: false,
      oldMessageDeleted: false,
    });
  });

  it("falls back to posting fresh when editing the tracked message fails", async () => {
    const { saveVerificationPanel } = setUp({
      panel: { channelId: "c1", messageId: "old-msg" },
      rest: {
        [`GET ${Routes.channel("c1")}`]: {
          id: "c1",
          guild_id: GUILD_ID,
          type: ChannelType.GuildText,
        },
        [`GET ${Routes.guild(GUILD_ID)}`]: { id: GUILD_ID, preferred_locale: "en-US" },
        [`GET ${Routes.channelMessage("c1", "old-msg")}`]: { id: "old-msg" },
        [`PATCH ${Routes.channelMessage("c1", "old-msg")}`]: new Error("edit failed"),
        [`POST ${Routes.channelMessages("c1")}`]: { id: "new-msg" },
      },
    });

    const result = await postOrEditVerifyPanel(GUILD_ID, { channelId: "c1" });

    expect(result).toEqual({
      channelId: "c1",
      messageId: "new-msg",
      posted: true,
      edited: false,
      moved: false,
      createdChannel: false,
      oldMessageDeleted: false,
    });
    expect(saveVerificationPanel).toHaveBeenCalledWith({
      guildId: GUILD_ID,
      channelId: "c1",
      messageId: "new-msg",
    });
  });

  it("moves channel, deletes the old message when asked, and posts fresh in the new channel", async () => {
    const restDelete = vi.fn().mockResolvedValue(undefined);
    setUp({
      panel: { channelId: "old-c", messageId: "old-msg" },
      rest: {
        [`GET ${Routes.channel("new-c")}`]: {
          id: "new-c",
          guild_id: GUILD_ID,
          type: ChannelType.GuildText,
        },
        [`GET ${Routes.guild(GUILD_ID)}`]: { id: GUILD_ID, preferred_locale: "en-US" },
        [`GET ${Routes.channel("old-c")}`]: {
          id: "old-c",
          guild_id: GUILD_ID,
          type: ChannelType.GuildText,
        },
        [`GET ${Routes.channelMessage("old-c", "old-msg")}`]: { id: "old-msg" },
        [`POST ${Routes.channelMessages("new-c")}`]: { id: "new-msg" },
      },
    });
    (container as any).client.rest.delete = restDelete;

    const result = await postOrEditVerifyPanel(GUILD_ID, {
      channelId: "new-c",
      deleteOldMessage: true,
    });

    expect(restDelete).toHaveBeenCalledWith(Routes.channelMessage("old-c", "old-msg"));
    expect(result).toEqual({
      channelId: "new-c",
      messageId: "new-msg",
      posted: true,
      edited: false,
      moved: true,
      createdChannel: false,
      oldMessageDeleted: true,
    });
  });

  it("does not delete the old message when not asked to, even after moving channels", async () => {
    const restDelete = vi.fn();
    setUp({
      panel: { channelId: "old-c", messageId: "old-msg" },
      rest: {
        [`GET ${Routes.channel("new-c")}`]: {
          id: "new-c",
          guild_id: GUILD_ID,
          type: ChannelType.GuildText,
        },
        [`GET ${Routes.guild(GUILD_ID)}`]: { id: GUILD_ID, preferred_locale: "en-US" },
        [`POST ${Routes.channelMessages("new-c")}`]: { id: "new-msg" },
      },
    });
    (container as any).client.rest.delete = restDelete;

    const result = await postOrEditVerifyPanel(GUILD_ID, {
      channelId: "new-c",
      deleteOldMessage: false,
    });

    expect(restDelete).not.toHaveBeenCalled();
    expect(result.oldMessageDeleted).toBe(false);
    expect(result.moved).toBe(true);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock("@discordjs/rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@discordjs/rest")>();
  return {
    ...actual,
    REST: vi.fn().mockImplementation(function (this: unknown) {
      return {
        setToken: vi.fn().mockReturnThis(),
        get: mockGet,
      };
    }),
  };
});

import { planShards } from "../src/shard-planner.js";
import { DiscordAPIError } from "@discordjs/rest";

describe("planShards", () => {
  const log = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function gatewayInfo(overrides: Record<string, unknown> = {}) {
    return {
      url: "wss://gateway.discord.gg",
      shards: 4,
      session_start_limit: {
        total: 1000,
        remaining: 999,
        reset_after: 3_600_000,
        max_concurrency: 1,
      },
      ...overrides,
    };
  }

  it("defaults to Discord's recommended shard count when TOTAL_SHARDS is unset", async () => {
    mockGet.mockResolvedValue(gatewayInfo({ shards: 6 }));

    const plan = await planShards({
      token: "t",
      log,
      env: {},
    });

    expect(plan.shardCount).toBe(6);
    expect(plan.recommendedShards).toBe(6);
    expect(plan.shards).toBeUndefined();
    expect(plan.maxConcurrency).toBe(1);
    expect(plan.gatewayUrl).toBe("wss://gateway.discord.gg");
  });

  it("honors an explicit TOTAL_SHARDS override", async () => {
    mockGet.mockResolvedValue(gatewayInfo({ shards: 4 }));

    const plan = await planShards({
      token: "t",
      log,
      env: { TOTAL_SHARDS: "10" },
    });

    expect(plan.shardCount).toBe(10);
    expect(plan.recommendedShards).toBe(4);
  });

  it("rejects a non-positive-integer TOTAL_SHARDS", async () => {
    mockGet.mockResolvedValue(gatewayInfo());

    await expect(
      planShards({
        token: "t",
        log,
        env: { TOTAL_SHARDS: "not-a-number" },
      }),
    ).rejects.toThrow(/positive integer/);
  });

  it("parses SHARD_LIST into the owned shard subset", async () => {
    mockGet.mockResolvedValue(gatewayInfo({ shards: 4 }));

    const plan = await planShards({
      token: "t",
      log,
      env: {
        TOTAL_SHARDS: "4",
        SHARD_LIST: "0, 1",
      },
    });

    expect(plan.shards).toEqual([0, 1]);
    expect(plan.shardCount).toBe(4);
  });

  it("rejects a SHARD_LIST id that is out of range for TOTAL_SHARDS", async () => {
    mockGet.mockResolvedValue(gatewayInfo({ shards: 4 }));

    await expect(
      planShards({
        token: "t",
        log,
        env: {
          TOTAL_SHARDS: "4",
          SHARD_LIST: "4",
        },
      }),
    ).rejects.toThrow(/SHARD_LIST has id 4/);
  });

  it("refuses to start when the session-start limit can't cover the shards to identify", async () => {
    mockGet.mockResolvedValue(
      gatewayInfo({
        shards: 4,
        session_start_limit: {
          total: 1000,
          remaining: 1,
          reset_after: 60_000,
          max_concurrency: 1,
        },
      }),
    );

    await expect(
      planShards({ token: "t", log, env: {} }),
    ).rejects.toThrow(/session_start_limit\.remaining=1/);
  });

  it("allows starting past the session-start limit when SHARD_IDENTIFY_FORCE=true", async () => {
    mockGet.mockResolvedValue(
      gatewayInfo({
        shards: 4,
        session_start_limit: {
          total: 1000,
          remaining: 1,
          reset_after: 60_000,
          max_concurrency: 1,
        },
      }),
    );

    const plan = await planShards({
      token: "t",
      log,
      env: { SHARD_IDENTIFY_FORCE: "true" },
    });

    expect(plan.shardCount).toBe(4);
  });

  it("surfaces a clean error when Discord rejects the token (401)", async () => {
    mockGet.mockRejectedValue(
      new DiscordAPIError(
        { message: "401: Unauthorized", code: 0 },
        0,
        401,
        "GET",
        "/gateway/bot",
        {},
      ),
    );

    await expect(
      planShards({ token: "bad-token", log, env: {} }),
    ).rejects.toThrow(/Discord rejected the bot token/);
  });
});

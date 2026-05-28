// Part II Phase S3 — Slice 1: /gateway/bot pre-flight + bucketed IDENTIFY.
//
// Discord's GET /gateway/bot returns the *recommended* shard count plus a
// session-start-limit bucket: how many IDENTIFY ops are left in the rolling
// window, how soon the bucket resets, and the `max_concurrency` we must
// bucket-IDENTIFY by (shardId % max_concurrency).
//
// discord.js calls this internally when `shardCount` is unset, but doing it
// explicitly here lets us:
//   - log shard count + remaining session starts on every boot for capacity
//     planning,
//   - refuse to start when `remaining < shardsToIdentify` so a crash-loop
//     can't burn the daily IDENTIFY budget and get the bot 401'd, and
//   - hand a real `max_concurrency` to `SimpleIdentifyThrottler` (slice 2
//     will swap this for a Redis-backed throttler keyed by the same value
//     so multiple gateway replicas share one IDENTIFY queue).
//
// Env contract:
//   SHARD_LIST="0,1,2"        pin shards this replica owns (cluster-managed in S3.2)
//   TOTAL_SHARDS=10           pin total shard count
//   TOTAL_SHARDS=auto         use the value Discord recommends
//   (both unset)              use the value Discord recommends
//   SHARD_IDENTIFY_FORCE=true bypass the session-start-limit refusal

import { REST } from "@discordjs/rest";
import { Routes, type APIGatewayBotInfo } from "discord-api-types/v10";
import { SimpleIdentifyThrottler } from "@discordjs/ws";
import type { IIdentifyThrottler } from "@discordjs/ws";

export interface ShardPlan {
  shardCount: number;
  shards: readonly number[] | undefined;
  maxConcurrency: number;
  recommendedShards: number;
  sessionStartLimit: APIGatewayBotInfo["session_start_limit"];
  gatewayUrl: string;
}

export interface ShardPlannerOptions {
  token: string;
  log: (level: "info" | "warn" | "error", msg: string, meta?: object) => void;
  /** Override env reads (used in tests). */
  env?: NodeJS.ProcessEnv;
}

export async function planShards(
  opts: ShardPlannerOptions,
): Promise<ShardPlan> {
  const env = opts.env ?? process.env;

  const rest = new REST({ version: "10" }).setToken(opts.token);
  const info = (await rest.get(Routes.gatewayBot())) as APIGatewayBotInfo;

  const recommendedShards = info.shards;
  const ssl = info.session_start_limit;
  const maxConcurrency = ssl.max_concurrency;

  const totalRaw = env["TOTAL_SHARDS"];
  let shardCount: number;
  if (totalRaw === undefined || totalRaw === "" || totalRaw === "auto") {
    shardCount = recommendedShards;
  } else {
    const n = Number.parseInt(totalRaw, 10);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error(
        `[ShardPlanner] TOTAL_SHARDS=${totalRaw} is not a positive integer (or "auto").`,
      );
    }
    shardCount = n;
  }

  let shards: number[] | undefined;
  if (env["SHARD_LIST"]) {
    shards = env["SHARD_LIST"]
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => {
        const n = Number.parseInt(s, 10);
        if (!Number.isFinite(n) || n < 0) {
          throw new Error(
            `[ShardPlanner] SHARD_LIST contains non-integer "${s}".`,
          );
        }
        return n;
      });
    if (shards.length > 0) {
      const max = Math.max(...shards);
      if (max >= shardCount) {
        throw new Error(
          `[ShardPlanner] SHARD_LIST has id ${max} but TOTAL_SHARDS=${shardCount} (valid ids: 0..${shardCount - 1}).`,
        );
      }
    } else {
      shards = undefined;
    }
  }

  // Session-start-limit guard. Each IDENTIFY consumes one slot; if we're about
  // to identify `shardsToIdentify` shards and `remaining` is below that, a
  // restart loop will exhaust the daily budget and Discord will temporarily
  // 401 the bot. Refuse loudly unless the operator opts in.
  const shardsToIdentify = shards?.length ?? shardCount;
  const force = env["SHARD_IDENTIFY_FORCE"] === "true";
  if (ssl.remaining < shardsToIdentify && !force) {
    throw new Error(
      `[ShardPlanner] session_start_limit.remaining=${ssl.remaining} < shards to identify=${shardsToIdentify}. ` +
        `Resets in ${Math.round(ssl.reset_after / 1000)}s. ` +
        `Set SHARD_IDENTIFY_FORCE=true to override (will likely fail and burn the bucket).`,
    );
  }

  opts.log("info", "shard plan resolved", {
    recommendedShards,
    shardCount,
    shards: shards ?? "all",
    maxConcurrency,
    sessionStart: {
      total: ssl.total,
      remaining: ssl.remaining,
      resetAfterMs: ssl.reset_after,
    },
    gatewayUrl: info.url,
  });

  return {
    shardCount,
    shards,
    maxConcurrency,
    recommendedShards,
    sessionStartLimit: ssl,
    gatewayUrl: info.url,
  };
}

/**
 * Build a `buildIdentifyThrottler` factory for `ClientOptions.ws` that returns
 * an in-process `SimpleIdentifyThrottler` bucketed by the plan's
 * `max_concurrency`. Slice 2 will swap this for a Redis-backed throttler so
 * multiple gateway replicas share a single IDENTIFY queue.
 */
export function buildSimpleThrottlerFactory(
  plan: Pick<ShardPlan, "maxConcurrency">,
) {
  return async (): Promise<IIdentifyThrottler> =>
    new SimpleIdentifyThrottler(plan.maxConcurrency);
}

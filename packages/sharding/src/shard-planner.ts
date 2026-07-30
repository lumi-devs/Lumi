// /gateway/bot pre-flight + bucketed IDENTIFY.
//
// GET /gateway/bot returns the recommended shard count and the session-start limit
// (IDENTIFYs left in the rolling window, reset time, and `max_concurrency` for
// bucketed IDENTIFY by shardId % max_concurrency). Calling it explicitly lets us log
// capacity on boot, refuse to start when `remaining < shardsToIdentify` (so a
// crash-loop can't burn the daily budget and get the bot 401'd), and hand a real
// `max_concurrency` to the IDENTIFY throttler.
//
// Env: SHARD_LIST pins the shards this replica owns (cluster-managed); TOTAL_SHARDS
// pins the total (`auto` or unset = Discord's recommendation); SHARD_IDENTIFY_FORCE
// bypasses the session-start-limit refusal.

import { REST, DiscordAPIError } from "@discordjs/rest";
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
  let info: APIGatewayBotInfo;
  try {
    info = (await rest.get(Routes.gatewayBot())) as APIGatewayBotInfo;
  } catch (err) {
    // This is the first Discord call any WS-holding role makes; surface the
    // two overwhelmingly common first-run failures as clean, actionable errors
    // instead of an uncaught DiscordAPIError stack.
    if (err instanceof DiscordAPIError && err.status === 401) {
      throw new Error(
        "[ShardPlanner] Discord rejected the bot token (401 Unauthorized). Check BOT_TOKEN in your .env.",
      );
    }
    throw new Error(
      `[ShardPlanner] GET /gateway/bot failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

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
 * `max_concurrency`. The cluster path swaps this for a Redis-backed throttler so
 * multiple gateway replicas share a single IDENTIFY queue.
 */
export function buildSimpleThrottlerFactory(
  plan: Pick<ShardPlan, "maxConcurrency">,
): () => Promise<IIdentifyThrottler> {
  return (): Promise<IIdentifyThrottler> =>
    Promise.resolve(new SimpleIdentifyThrottler(plan.maxConcurrency));
}

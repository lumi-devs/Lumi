import { createHash } from "node:crypto";
import { container } from "@sapphire/framework";
import { tryParseJSON } from "@sapphire/utilities";
import { CodedRpcError, RpcFailureCodes } from "@lumi/contracts/rpc";
import { RedisKeys, RedisTTL } from "#lib/database/redis.js";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

function hashInput(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(input) ?? null))
    .digest("hex")
    .slice(0, 32);
}

interface IdempotencyRecord {
  status: "pending" | "done";
  result?: unknown;
}

/**
 * Guards a destructive/creating RPC handler against duplicate side effects
 * from a double-click, Server Action retry, or network retry of the same
 * logical request. Keys purely on (action, guildId, input) - no dashboard
 * change needed - so it only dedupes a request against itself, not against
 * a distinct request that happens to have the same effect.
 *
 * A concurrent or replayed call while the first is still running throws
 * `Conflict`; a replay after completion returns the original result instead
 * of re-running `fn`, so the caller sees success without a second write.
 */
export async function withIdempotency<T>(
  action: string,
  guildId: string,
  input: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const key = RedisKeys.rpcIdempotency(action, guildId, hashInput(input));
  const pending: IdempotencyRecord = { status: "pending" };
  const acquired = await container.redis.set(
    key,
    JSON.stringify(pending),
    "PX",
    RedisTTL.rpcIdempotencyPending * 1000,
    "NX",
  );

  if (acquired !== "OK") {
    const raw = await container.redis.get(key);
    const record = raw
      ? (tryParseJSON(raw) as IdempotencyRecord | null)
      : null;
    if (record?.status === "done") return record.result as T;
    throw new CodedRpcError(
      RpcFailureCodes.Conflict,
      "This action is already in progress or was already completed - please wait a moment and refresh.",
    );
  }

  try {
    const result = await fn();
    const done: IdempotencyRecord = { status: "done", result };
    await container.redis.set(
      key,
      JSON.stringify(done),
      "PX",
      RedisTTL.rpcIdempotencyDone * 1000,
    );
    return result;
  } catch (err) {
    await container.redis.del(key).catch(() => null);
    throw err;
  }
}

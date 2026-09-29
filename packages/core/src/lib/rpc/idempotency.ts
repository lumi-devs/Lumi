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

// `dispatchRpc` (packages/core/src/lib/rpc/dispatch.ts) never wraps the
// handler in a timeout or AbortController - `timeoutMs` on the contract entry
// only drives the dashboard fetch client's own AbortController
// (apps/dashboard/src/lib/rpc.ts). So a handler that runs past its declared
// timeout keeps running server-side even after the caller sees a timeout
// error; the base pending TTL below only has to survive the *declared*
// budget plus scheduling/network jitter, not an unbounded overrun - that's
// covered separately by the periodic refresh while `fn` runs.
const DefaultMarginMs = 10_000;

/**
 * Guards a destructive/creating RPC handler against duplicate side effects
 * from a double-click, Server Action retry, or network retry of the same
 * logical request. Keys purely on (action, guildId, input) - no dashboard
 * change needed - so it only dedupes a request against itself, not against
 * a distinct request that happens to have the same effect.
 *
 * `timeoutMs` should be the wrapped action's own `RpcActionDef.timeoutMs`
 * (from its `packages/contracts/src/rpc/*.ts` entry), so the pending lock's
 * TTL is derived from - and never shorter than - the budget the action was
 * actually given, correct by construction for any action this gets wired
 * into later. While `fn` runs, the lock is periodically re-armed to the same
 * TTL so a handler that overruns its declared timeout (see above) doesn't
 * have its lock expire out from under it, which would let a concurrent retry
 * start a second, genuinely duplicate run.
 *
 * A concurrent or replayed call while the first is still running throws
 * `Conflict`; a replay after completion returns the original result instead
 * of re-running `fn`, so the caller sees success without a second write.
 */
export async function withIdempotency<T>(
  action: string,
  guildId: string,
  timeoutMs: number,
  input: unknown,
  fn: () => Promise<T>,
  marginMs = DefaultMarginMs,
): Promise<T> {
  const key = RedisKeys.rpcIdempotency(action, guildId, hashInput(input));
  const pendingTtlMs = timeoutMs + marginMs;
  const pending: IdempotencyRecord = { status: "pending" };
  const acquired = await container.redis.set(
    key,
    JSON.stringify(pending),
    "PX",
    pendingTtlMs,
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

  const refresh = setInterval(
    () => {
      container.redis.pexpire(key, pendingTtlMs).catch(() => undefined);
    },
    Math.max(1, Math.floor(pendingTtlMs / 2)),
  );
  refresh.unref?.();

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
  } finally {
    clearInterval(refresh);
  }
}

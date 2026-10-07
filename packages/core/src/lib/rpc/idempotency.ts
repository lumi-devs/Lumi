import { createHash } from "node:crypto";
import { container } from "#lib/services.js";
import { tryParseJSON } from "@lumi/shared";
import { CodedRpcError, RpcFailureCodes } from "@lumi/contracts/rpc";
import { ValkeyKeys, ValkeyTTL } from "#lib/database/valkey.js";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
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

// Buffer added to lock TTL beyond declared action timeout to account for network/scheduling jitter.
const DefaultMarginMs = 10_000;

/**
 * Deduplicates mutating RPC calls by (action, guildId, key/hashed input) using Valkey locks.
 * Replays completed results or throws Conflict if execution is currently in progress.
 */
export async function withIdempotency<T>(
  action: string,
  guildId: string,
  timeoutMs: number,
  input: unknown,
  fn: () => Promise<T>,
  marginMs = DefaultMarginMs,
  idempotencyKey?: string,
): Promise<T> {
  const token = idempotencyKey ? `key:${idempotencyKey}` : hashInput(input);
  const key = ValkeyKeys.rpcIdempotency(action, guildId, token);
  const pendingTtlMs = timeoutMs + marginMs;
  const pending: IdempotencyRecord = { status: "pending" };
  const acquired = await container.valkey.set(
    key,
    JSON.stringify(pending),
    "PX",
    pendingTtlMs,
    "NX",
  );

  if (acquired !== "OK") {
    const raw = await container.valkey.get(key);
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
      container.valkey.pexpire(key, pendingTtlMs).catch(() => undefined);
    },
    Math.max(1, Math.floor(pendingTtlMs / 2)),
  );
  refresh.unref?.();

  try {
    const result = await fn();
    const done: IdempotencyRecord = { status: "done", result };
    await container.valkey.set(
      key,
      JSON.stringify(done),
      "PX",
      ValkeyTTL.rpcIdempotencyDone * 1000,
    );
    return result;
  } catch (err) {
    await container.valkey.del(key).catch(() => null);
    throw err;
  } finally {
    clearInterval(refresh);
  }
}

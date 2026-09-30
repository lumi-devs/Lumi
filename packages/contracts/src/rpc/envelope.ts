import { s } from "@sapphire/shapeshift";

export interface RpcRequest<T = unknown> {
  id: string;
  action: string;
  guildId?: string;
  actorId?: string;
  /** W3C `traceparent` (+ optional `tracestate`) so the handler can continue the caller's trace. */
  traceparent?: string;
  tracestate?: string;
  data?: T;
}

/**
 * Machine-readable cause on every failure envelope. Callers branch on these,
 * never on `error` text: a missing guild and a database outage are both "the
 * request failed", but only one of them means "invite the bot".
 */
export const RpcFailureCodes = {
  /** The transport rejected the caller's internal token. */
  Unauthorized: "UNAUTHORIZED",
  BadRequest: "BAD_REQUEST",
  UnknownAction: "UNKNOWN_ACTION",
  DashboardDisabled: "DASHBOARD_DISABLED",
  /** The actor is not allowed to run this action. */
  Forbidden: "FORBIDDEN",
  /** The bot is not in the guild (or cannot see it). */
  GuildNotFound: "GUILD_NOT_FOUND",
  ModuleNotLoaded: "MODULE_NOT_LOADED",
  /** A duplicate submission of an in-flight or already-completed idempotent action. */
  Conflict: "CONFLICT",
  /** The handler itself failed; `error` is meant for the user. */
  HandlerError: "HANDLER_ERROR",
  Internal: "INTERNAL",
  /** Caller's `x-lumi-contract-version` header is incompatible with this server's `@lumi/contracts` build. */
  ContractMismatch: "CONTRACT_MISMATCH",
} as const;

export type RpcFailureCode =
  (typeof RpcFailureCodes)[keyof typeof RpcFailureCodes];

/**
 * Whether a caller can expect a retry of the *same* request to plausibly
 * succeed, keyed purely on the failure code - the one place this is decided,
 * so nothing downstream (dispatch, the addon sandbox, the client) guesses on
 * its own. A thrower can still override this per-instance via
 * {@linkcode CodedRpcError}'s `retryable` option (e.g. a permission check
 * that failed because Discord's API is down, versus one that failed because
 * the permission is genuinely missing - both currently surface as
 * `HANDLER_ERROR`/`FORBIDDEN`, so the code alone can't tell them apart).
 *
 * `CONFLICT` is true because it's also used for "this idempotent action is
 * already done" (see `packages/core/src/lib/rpc/idempotency.ts`), where a
 * retry either safely no-ops into the cached result or clears once the
 * in-flight run finishes - never for a conflict that a retry can't resolve.
 */
export const RpcRetryableByDefault: Record<RpcFailureCode, boolean> = {
  [RpcFailureCodes.Unauthorized]: false,
  [RpcFailureCodes.BadRequest]: false,
  [RpcFailureCodes.UnknownAction]: false,
  [RpcFailureCodes.DashboardDisabled]: false,
  [RpcFailureCodes.Forbidden]: false,
  [RpcFailureCodes.GuildNotFound]: false,
  [RpcFailureCodes.ModuleNotLoaded]: false,
  [RpcFailureCodes.Conflict]: true,
  [RpcFailureCodes.HandlerError]: false,
  [RpcFailureCodes.Internal]: false,
  [RpcFailureCodes.ContractMismatch]: false,
};

export interface CodedRpcErrorOptions {
  /** Overrides {@linkcode RpcRetryableByDefault} for this specific failure. */
  retryable?: boolean;
  /** Hints how long a retryable failure wants the caller to wait first. */
  retryAfterMs?: number;
}

/** Thrown inside the RPC pipeline to put a specific `code` on the failure envelope. */
export class CodedRpcError extends Error {
  public readonly code: RpcFailureCode;
  public readonly retryable: boolean;
  public readonly retryAfterMs?: number;

  public constructor(code: RpcFailureCode, message: string, options?: CodedRpcErrorOptions) {
    super(message);
    this.name = "CodedRpcError";
    this.code = code;
    this.retryable = options?.retryable ?? RpcRetryableByDefault[code];
    this.retryAfterMs = options?.retryAfterMs;
  }
}

export type RpcResponse<T = unknown> =
  | {
      id: string;
      ok: true;
      data?: T;
      error?: never;
      code?: never;
      retryable?: never;
      retryAfterMs?: never;
    }
  | {
      id: string;
      ok: false;
      data?: never;
      error: string;
      code: RpcFailureCode;
      retryable: boolean;
      retryAfterMs?: number;
    };

/** Builds a failure envelope, deriving `retryable` from {@linkcode RpcRetryableByDefault} unless overridden. */
export function makeRpcFailure(
  id: string,
  error: string,
  code: RpcFailureCode,
  options?: CodedRpcErrorOptions,
): RpcResponse {
  return {
    id,
    ok: false,
    error,
    code,
    retryable: options?.retryable ?? RpcRetryableByDefault[code],
    retryAfterMs: options?.retryAfterMs,
  };
}

/** Runtime check on the envelope only - dashboard and worker deploy independently, so this is the one shape TypeScript can't guarantee across the wire. */
const RpcResponseEnvelopeSchema = s.object({
  id: s.string(),
  ok: s.boolean(),
  data: s.unknown().optional(),
  error: s.string().optional(),
  code: s.enum(Object.values(RpcFailureCodes)).optional(),
  retryable: s.boolean().optional(),
  retryAfterMs: s.number().optional(),
});

/**
 * Throws with a clear message if `raw` isn't a well-formed `RpcResponse`
 * envelope. A response without `retryable` (an older worker/dashboard build
 * that predates this field) falls back to {@linkcode RpcRetryableByDefault}
 * for the code, so this stays backward compatible across independently
 * deployed builds.
 */
export function parseRpcResponse(raw: unknown): RpcResponse {
  let envelope;
  try {
    envelope = RpcResponseEnvelopeSchema.parse(raw);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Malformed RPC response envelope: ${msg}`);
  }
  if (envelope.ok) {
    if (envelope.error !== undefined || envelope.code !== undefined) {
      throw new Error("Malformed RPC response envelope: ok:true with error");
    }
    return { id: envelope.id, ok: true, data: envelope.data };
  }
  if (envelope.error === undefined || envelope.code === undefined) {
    throw new Error(
      "Malformed RPC response envelope: ok:false without error and code",
    );
  }
  return {
    id: envelope.id,
    ok: false,
    error: envelope.error,
    code: envelope.code,
    retryable: envelope.retryable ?? RpcRetryableByDefault[envelope.code],
    retryAfterMs: envelope.retryAfterMs,
  };
}

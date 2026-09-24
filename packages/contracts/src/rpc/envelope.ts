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
  /** The handler itself failed; `error` is meant for the user. */
  HandlerError: "HANDLER_ERROR",
  Internal: "INTERNAL",
} as const;

export type RpcFailureCode =
  (typeof RpcFailureCodes)[keyof typeof RpcFailureCodes];

/** Thrown inside the RPC pipeline to put a specific `code` on the failure envelope. */
export class CodedRpcError extends Error {
  public readonly code: RpcFailureCode;

  public constructor(code: RpcFailureCode, message: string) {
    super(message);
    this.name = "CodedRpcError";
    this.code = code;
  }
}

export type RpcResponse<T = unknown> =
  | { id: string; ok: true; data?: T; error?: never; code?: never }
  | { id: string; ok: false; data?: never; error: string; code: RpcFailureCode };

/** Runtime check on the envelope only - dashboard and worker deploy independently, so this is the one shape TypeScript can't guarantee across the wire. */
const RpcResponseEnvelopeSchema = s.object({
  id: s.string(),
  ok: s.boolean(),
  data: s.unknown().optional(),
  error: s.string().optional(),
  code: s.enum(Object.values(RpcFailureCodes)).optional(),
});

/** Throws with a clear message if `raw` isn't a well-formed `RpcResponse` envelope. */
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
  };
}

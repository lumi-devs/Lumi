import { z } from "zod";

export interface RpcRequest<T = unknown> {
  id: string;
  action: string;
  guildId?: string;
  actorId?: string;

  idempotencyKey?: string;

  traceparent?: string;
  tracestate?: string;
  data?: T;
}

export interface RpcBatchRequest {
  requests: RpcRequest<unknown>[];
}

export interface RpcBatchResponse {
  responses: RpcResponse<unknown>[];
}

export const RpcFailureCodes = {

  Unauthorized: "UNAUTHORIZED",
  BadRequest: "BAD_REQUEST",
  UnknownAction: "UNKNOWN_ACTION",
  DashboardDisabled: "DASHBOARD_DISABLED",

  Forbidden: "FORBIDDEN",

  GuildNotFound: "GUILD_NOT_FOUND",
  ModuleNotLoaded: "MODULE_NOT_LOADED",

  Conflict: "CONFLICT",

  HandlerError: "HANDLER_ERROR",
  Internal: "INTERNAL",

  ContractMismatch: "CONTRACT_MISMATCH",
} as const;

export type RpcFailureCode =
  (typeof RpcFailureCodes)[keyof typeof RpcFailureCodes];

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

  retryable?: boolean;

  retryAfterMs?: number;
}

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

const RpcResponseEnvelopeSchema = z.object({
  id: z.string(),
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  code: z.enum(RpcFailureCodes).optional(),
  retryable: z.boolean().optional(),
  retryAfterMs: z.number().optional(),
});

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
  if (envelope.retryable === undefined) {
    throw new Error(
      "Malformed RPC response envelope: ok:false without retryable",
    );
  }
  return {
    id: envelope.id,
    ok: false,
    error: envelope.error,
    code: envelope.code,
    retryable: envelope.retryable,
    retryAfterMs: envelope.retryAfterMs,
  };
}

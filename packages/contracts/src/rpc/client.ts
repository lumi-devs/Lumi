import { randomUUID } from "node:crypto";
import { CONTRACT_VERSION } from "../version.js";
import {
  parseRpcResponse,
  RpcFailureCodes,
  RpcRetryableByDefault,
  type RpcFailureCode,
  type RpcRequest,
} from "./envelope.js";
import { rpcRouter, type RpcActionName, type RpcInput, type RpcOutput } from "./router.js";

export type RpcErrorCode = "TIMEOUT" | "WORKER_DOWN" | "MALFORMED" | RpcFailureCode;

/**
 * Default retryability for the client-only codes (the transport never got a
 * server envelope to read `retryable` off): a timeout or a refused/dropped
 * connection is exactly the "worth retrying" case, an undecodable body is
 * not - retrying the same malformed response gets the same result.
 */
const ClientOnlyRetryableByDefault = {
  TIMEOUT: true,
  WORKER_DOWN: true,
  MALFORMED: false,
} as const satisfies Record<"TIMEOUT" | "WORKER_DOWN" | "MALFORMED", boolean>;

function isClientOnlyCode(
  code: RpcErrorCode,
): code is keyof typeof ClientOnlyRetryableByDefault {
  return code in ClientOnlyRetryableByDefault;
}

function retryableForCode(code: RpcErrorCode): boolean {
  return isClientOnlyCode(code)
    ? ClientOnlyRetryableByDefault[code]
    : RpcRetryableByDefault[code];
}

export interface RpcErrorOptions {
  retryable?: boolean;
  retryAfterMs?: number;
}

export class RpcError extends Error {
  public readonly code: RpcErrorCode;
  public readonly action: string;
  public readonly retryable: boolean;
  public readonly retryAfterMs?: number;
  public constructor(
    code: RpcErrorCode,
    action: string,
    message?: string,
    options?: RpcErrorOptions,
  ) {
    super(message ?? `RPC ${action}: ${code}`);
    this.name = "RpcError";
    this.code = code;
    this.action = action;
    this.retryable = options?.retryable ?? retryableForCode(code);
    this.retryAfterMs = options?.retryAfterMs;
  }
}

/**
 * True when the bot itself reported it cannot see the guild. Every other
 * failure — worker down, timeout, database error — means the request could not
 * be answered, which is a different thing to tell the user.
 */
export function isGuildMissing(err: unknown): boolean {
  return err instanceof RpcError && err.code === RpcFailureCodes.GuildNotFound;
}

/**
 * True when the server rejected this caller's `@lumi/contracts` version as
 * incompatible with its own. `err.message` already names both versions
 * (built server-side, see `packages/core/src/lib/rpc/http-server.ts`) — this
 * only tells a caller when to show that message instead of a generic
 * "something went wrong".
 */
export function isContractMismatch(err: unknown): boolean {
  return err instanceof RpcError && err.code === RpcFailureCodes.ContractMismatch;
}

type CallOptions<A extends RpcActionName> = {
  guildId?: string;
  actorId?: string;
} & (RpcInput<A> extends undefined ? { data?: undefined } : { data: RpcInput<A> });

export interface RpcClientOptions {
  baseUrl: string;
  token?: string;
  logger?: (msg: string) => void;
  /** Lets a caller stamp W3C trace headers onto the outgoing request without this package depending on a tracing library. */
  injectTraceHeaders?: () => { traceparent?: string; tracestate?: string };
}

/**
 * Talks to `apps/api`'s internal HTTP RPC server over plain HTTP. Carries no
 * knowledge of its caller's runtime — no `server-only`, no env module, no
 * process-wide singleton — those are the caller's concerns.
 *
 * `actorId` on the wire is an unsigned claim, so the server only honours it
 * from callers holding its shared internal token, sent here as a bearer token.
 */
export class RpcClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly log: (msg: string) => void;
  private readonly injectTraceHeaders: () => { traceparent?: string; tracestate?: string };

  public constructor(options: RpcClientOptions) {
    this.baseUrl = options.baseUrl;
    this.token = options.token ?? "";
    this.log = options.logger ?? (() => {});
    this.injectTraceHeaders = options.injectTraceHeaders ?? (() => ({}));
  }

  private buildRequest(
    action: string,
    guildId: string | undefined,
    actorId: string | undefined,
    data: unknown,
  ): RpcRequest {
    const traceCarrier = this.injectTraceHeaders();
    return {
      id: randomUUID(),
      action,
      guildId,
      actorId,
      traceparent: traceCarrier.traceparent,
      tracestate: traceCarrier.tracestate,
      data,
    };
  }

  private async post(action: string, request: RpcRequest, timeoutMs: number): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/rpc`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-lumi-contract-version": CONTRACT_VERSION,
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new RpcError("TIMEOUT", action, `RPC timed out: ${action}`);
      }
      throw new RpcError("WORKER_DOWN", action, err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
    }

    try {
      return await res.json();
    } catch (err: unknown) {
      this.log(`Discarding undecodable RPC response: ${String(err)}`);
      throw new RpcError("MALFORMED", action, `RPC ${action}: malformed response`);
    }
  }

  public async invoke<A extends RpcActionName>(
    action: A,
    options: CallOptions<A>,
  ): Promise<RpcOutput<A>> {
    const raw = await this.post(
      action,
      this.buildRequest(action, options.guildId, options.actorId, options.data),
      rpcRouter[action].timeoutMs,
    );
    let response;
    try {
      response = parseRpcResponse(raw);
    } catch (err: unknown) {
      this.log(`Discarding malformed RPC envelope for ${action}: ${String(err)}`);
      throw new RpcError("MALFORMED", action, `RPC ${action}: malformed response`);
    }
    if (!response.ok) {
      throw new RpcError(response.code, action, response.error, {
        retryable: response.retryable,
        retryAfterMs: response.retryAfterMs,
      });
    }
    if (response.data === undefined || response.data === null) {
      this.log(`RPC ${action}: response ok but missing expected data`);
      throw new RpcError("MALFORMED", action, `RPC ${action}: response missing expected data`);
    }
    return response.data as RpcOutput<A>;
  }

  /** Hits the server's `/healthz` — used by readiness probes. */
  public async healthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/healthz`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

import "server-only";
import { randomUUID } from "node:crypto";
import {
  parseRpcResponse,
  type RpcRequest,
  type RpcResponse,
  type RpcActionName,
  type RpcRequestPayloads,
} from "@lumi/contracts";
import { injectTraceContext } from "@lumi/observability";
import { env } from "./env";

const DefaultTimeoutMs = 8000;
const HeavyReadTimeoutMs = 12000;
const MutationTimeoutMs = 15000;

export type RpcErrorCode = "TIMEOUT" | "WORKER_DOWN" | "RPC_ERROR" | "MALFORMED";

export class RpcError extends Error {
  public readonly code: RpcErrorCode;
  public readonly action: string;
  public constructor(code: RpcErrorCode, action: string, message?: string) {
    super(message ?? `RPC ${action}: ${code}`);
    this.name = "RpcError";
    this.code = code;
    this.action = action;
  }
}

function defaultTimeoutFor(action: string): number {
  if (action === "guild.dashboard.get" || action.endsWith(".audit.list")) return HeavyReadTimeoutMs;
  if (action.endsWith(".list") || action.endsWith(".get")) return DefaultTimeoutMs;
  return MutationTimeoutMs;
}

interface CallOptions<A extends RpcActionName> {
  guildId?: string;
  actorId?: string;
  data?: RpcRequestPayloads[A];
  timeoutMs?: number;
}

/**
 * Talks to the worker's internal HTTP RPC server directly over the docker
 * network (see packages/core/src/lib/rpc/http-server.ts) — no message broker
 * in between.
 *
 * `actorId` on the wire is an unsigned claim, so the worker only honours it
 * from callers holding the shared `RPC_INTERNAL_TOKEN`, sent here as a bearer
 * token. It must match the worker's value byte for byte.
 *
 * `server-only`: reachable exclusively from Server Components, Route Handlers
 * and Server Actions — see docs/dashboard.md "Hard boundaries".
 */
export class RpcClient {
  public constructor(
    private readonly baseUrl: string,
    private readonly token: string = "",
    private readonly log: (msg: string) => void = () => {},
  ) {}

  public async call<A extends RpcActionName>(
    action: A,
    options: CallOptions<A> = {},
  ): Promise<RpcResponse["data"]> {
    const traceCarrier = injectTraceContext();
    const request: RpcRequest = {
      id: randomUUID(),
      action,
      guildId: options.guildId,
      actorId: options.actorId,
      traceparent: traceCarrier["traceparent"],
      tracestate: traceCarrier["tracestate"],
      data: options.data,
    };

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? defaultTimeoutFor(action),
    );

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/rpc`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
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

    let raw: unknown;
    try {
      raw = await res.json();
    } catch (err: unknown) {
      this.log(`Discarding undecodable RPC response: ${String(err)}`);
      throw new RpcError("MALFORMED", action, `RPC ${action}: malformed response`);
    }

    let response: RpcResponse;
    try {
      response = parseRpcResponse(raw);
    } catch (err: unknown) {
      this.log(`Discarding malformed RPC envelope for ${action}: ${String(err)}`);
      throw new RpcError("MALFORMED", action, `RPC ${action}: malformed response`);
    }

    if (!response.ok) throw new RpcError("RPC_ERROR", action, response.error ?? "RPC error");
    return response.data;
  }

  /** Hits the worker's `/healthz` — used by the readiness probe. */
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

// Next.js has no long-lived bootstrap to wire this up in — handlers, Server
// Components and Server Actions are all invoked ad hoc — so the client is a
// lazy module-scope singleton. `globalThis` keeps `next dev` hot-reloads from
// constructing a fresh one each time.
const globalForRpc = globalThis as unknown as { rpcClient?: RpcClient };

export function getRpcClient(): RpcClient {
  if (!globalForRpc.rpcClient) {
    globalForRpc.rpcClient = new RpcClient(
      env.rpcHttpUrl,
      env.rpcInternalToken,
      (msg) => {
        if (env.isDevelopment) console.debug(msg);
      },
    );
  }
  return globalForRpc.rpcClient;
}

export function rpcCall<A extends RpcActionName>(
  action: A,
  options?: CallOptions<A>,
): Promise<RpcResponse["data"]> {
  return getRpcClient().call(action, options);
}

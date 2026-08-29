import "server-only";
import { randomUUID } from "node:crypto";
import type {
  RpcRequest,
  RpcResponse,
  RpcActionName,
  RpcRequestPayloads,
} from "@lumi/contracts";
import { injectTraceContext } from "@lumi/observability";
import { env } from "./env";

const DEFAULT_TIMEOUT_MS = 8000;

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
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
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
        throw new Error(`RPC timed out: ${action}`);
      }
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      clearTimeout(timer);
    }

    let response: RpcResponse;
    try {
      response = (await res.json()) as RpcResponse;
    } catch (err: unknown) {
      this.log(`Discarding undecodable RPC response: ${String(err)}`);
      throw new Error(`RPC ${action}: malformed response`);
    }

    if (!response.ok) throw new Error(response.error ?? "RPC error");
    return response.data;
  }

  /** Hits the worker's `/healthz` — used by the readiness probe. */
  public async healthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/healthz`);
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
        if (process.env["NODE_ENV"] === "development") console.debug(msg);
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

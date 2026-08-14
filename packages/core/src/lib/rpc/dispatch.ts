import { container } from "@sapphire/framework";
import { runWithContext } from "@lumi/observability";
import { logError, errorFrom } from "#lib/utilities/errors.js";
import type { RpcRequest, RpcResponse, RpcHandler } from "@lumi/contracts";

export type { RpcRequest, RpcResponse, RpcHandler };

export const rpcHandlers = new Map<string, RpcHandler<unknown, unknown>>();

export function registerRpcHandler<TIn, TOut>(
  action: string,
  handler: RpcHandler<TIn, TOut>,
): void {
  rpcHandlers.set(action, handler as RpcHandler<unknown, unknown>);
}

/**
 * The transport-agnostic core of RPC handling — handler lookup, the
 * dashboard-enabled check, and error shaping. `http-server.ts` is the only
 * transport that calls this.
 *
 * `req.actorId` is an unauthenticated claim at this layer: handlers may treat
 * it as the acting user only because every transport authenticates the caller
 * first (the HTTP transport requires `RPC_INTERNAL_TOKEN`). Any new transport
 * must do the same before calling in.
 */
export async function dispatchRpc(req: RpcRequest<unknown>): Promise<RpcResponse<unknown>> {
  const handler = rpcHandlers.get(req.action);
  if (!handler) {
    return {
      id: req.id,
      ok: false,
      error: `No handler registered for action "${req.action}"`,
    };
  }

  if (
    req.guildId &&
    !(await container.db.config.isDashboardEnabled(req.guildId))
  ) {
    return { id: req.id, ok: false, error: "Dashboard disabled" };
  }

  return runWithContext(
    {
      correlationId: req.id,
      source: "rpc",
      name: req.action,
      guildId: req.guildId,
      userId: req.actorId,
    },
    async () => {
      const startedAt = Date.now();
      try {
        const data = await handler(req);
        container.logger.debug(`[RPC] ${req.action} ok`, {
          durationMs: Date.now() - startedAt,
        });
        return { id: req.id, ok: true, data };
      } catch (err: unknown) {
        logError(`RPC: ${req.action} error`, err);
        container.logger.error(`[RPC] ${req.action} failed`, {
          durationMs: Date.now() - startedAt,
        });
        return {
          id: req.id,
          ok: false,
          error: errorFrom(err).message ?? "Internal error",
        };
      }
    },
  );
}

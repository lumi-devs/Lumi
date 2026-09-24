import { container } from "@sapphire/framework";
import { Prisma } from "@prisma/client";
import { runWithContext } from "@lumi/observability";
import {
  CodedRpcError,
  RpcFailureCodes,
  type RpcRequest,
  type RpcResponse,
} from "@lumi/contracts/rpc";
import { handlePrismaError } from "#lib/prisma/errors.js";
import { getRpcHandler } from "#lib/rpc/registry.js";
import { errorFrom, logError } from "#lib/utilities/errors.js";

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
export async function dispatchRpc(req: RpcRequest): Promise<RpcResponse> {
  const handler = getRpcHandler(req.action);
  if (!handler) {
    return {
      id: req.id,
      ok: false,
      error: `No handler registered for action "${req.action}"`,
      code: RpcFailureCodes.UnknownAction,
    };
  }

  if (
    req.guildId &&
    !(await container.db.config.isDashboardEnabled(req.guildId))
  ) {
    return {
      id: req.id,
      ok: false,
      error: "Dashboard disabled",
      code: RpcFailureCodes.DashboardDisabled,
    };
  }

  return runWithContext(
    {
      correlationId: req.id,
      source: "rpc",
      name: req.action,
      guildId: req.guildId,
      userId: req.actorId,
    },
    async (): Promise<RpcResponse> => {
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
        // Prisma errors carry the query/file path/line in `.message` - never
        // let those cross the wire raw, even though a caught-and-rethrown
        // application `Error` (e.g. "A permit named X already exists.") is
        // meant to reach the caller verbatim.
        const isPrismaError =
          err instanceof Prisma.PrismaClientKnownRequestError ||
          err instanceof Prisma.PrismaClientValidationError ||
          err instanceof Prisma.PrismaClientInitializationError;
        const safeErr = isPrismaError ? handlePrismaError(err) : errorFrom(err);
        return {
          id: req.id,
          ok: false,
          error: safeErr.message ?? "Internal error",
          code:
            err instanceof CodedRpcError
              ? err.code
              : RpcFailureCodes.HandlerError,
        };
      }
    },
  );
}

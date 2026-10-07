import { container } from "#lib/services.js";
import { Prisma } from "@prisma/client";
import {
  runWithContext,
  semaphoreInFlight,
  semaphoreQueued,
  semaphoreRejectedTotal,
} from "@lumi/observability";
import {
  CodedRpcError,
  makeRpcFailure,
  rpcRouter,
  RpcFailureCodes,
  RpcRetryableByDefault,
  type RpcRequest,
  type RpcResponse,
} from "@lumi/contracts/rpc";
import {
  resolveRpcDiscordBulkheadQueueLimit,
  resolveRpcDiscordBulkheadSize,
} from "#lib/env.js";
import { handlePrismaError } from "#lib/prisma/errors.js";
import { getRpcHandler } from "#lib/rpc/registry.js";
import { Semaphore, SemaphoreQueueFullError } from "#lib/utilities/concurrency.js";
import { errorFrom, logError } from "#lib/utilities/errors.js";

/**
 * Bulkheads RPC actions whose *authorizer* makes a Discord REST call before
 * the handler even runs - every `guildManager` action does, via
 * `requireGuildManager`/`checkGuildManagerRest` in `implement.ts`. A stall on
 * Discord's API would otherwise let those in-flight requests pile up
 * unbounded on the same process and starve DB-only actions (`botOwner`,
 * `session`, `public`) sharing it. Classified structurally off the router's
 * own `auth` field rather than a hand-kept action list, so a newly added
 * `guildManager` action is bulkheaded automatically.
 *
 * discord.js already retries/queues its own REST calls - this only bounds
 * *concurrency* into that layer, it doesn't add a second retry loop on top.
 */
const DiscordBulkheadName = "rpc-discord";
let discordBulkhead = new Semaphore(resolveRpcDiscordBulkheadSize(), {
  name: DiscordBulkheadName,
  maxQueueLength: resolveRpcDiscordBulkheadQueueLimit(),
});

/** Rebuilds the bulkhead with fresh (or explicit) sizing, since it's otherwise sized once from env at module load. Test-only. */
export function resetDiscordBulkheadForTests(
  size: number = resolveRpcDiscordBulkheadSize(),
  maxQueueLength: number = resolveRpcDiscordBulkheadQueueLimit(),
): void {
  discordBulkhead = new Semaphore(size, { name: DiscordBulkheadName, maxQueueLength });
}

function reportDiscordBulkheadGauges(): void {
  semaphoreInFlight.set({ semaphore: DiscordBulkheadName }, discordBulkhead.inFlight);
  semaphoreQueued.set({ semaphore: DiscordBulkheadName }, discordBulkhead.queued);
}

function isDiscordBoundAction(action: string): boolean {
  return (rpcRouter as Record<string, { auth?: string } | undefined>)[action]?.auth ===
    "guildManager";
}

async function runThroughDiscordBulkhead<T>(fn: () => Promise<T>): Promise<T> {
  try {
    // `run()`'s permit-or-enqueue decision happens synchronously before its
    // first `await`, so the gauges are already accurate the instant this
    // call returns - reported here to reflect a caller stuck queuing, not
    // just once it's acquired a permit.
    const pending = discordBulkhead.run(fn);
    reportDiscordBulkheadGauges();
    return await pending;
  } catch (err: unknown) {
    if (err instanceof SemaphoreQueueFullError) {
      semaphoreRejectedTotal.inc({ semaphore: DiscordBulkheadName });
      throw new CodedRpcError(
        RpcFailureCodes.HandlerError,
        "Too many Discord-bound requests in flight right now. Try again shortly.",
        { retryable: true },
      );
    }
    throw err;
  } finally {
    reportDiscordBulkheadGauges();
  }
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
export async function dispatchRpc(req: RpcRequest): Promise<RpcResponse> {
  const handler = getRpcHandler(req.action);
  if (!handler) {
    return makeRpcFailure(
      req.id,
      `No handler registered for action "${req.action}"`,
      RpcFailureCodes.UnknownAction,
    );
  }

  if (
    req.guildId &&
    !(await container.db.config.isDashboardEnabled(req.guildId))
  ) {
    return makeRpcFailure(req.id, "Dashboard disabled", RpcFailureCodes.DashboardDisabled);
  }

  const bulkheaded = isDiscordBoundAction(req.action);

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
        const data = bulkheaded
          ? await runThroughDiscordBulkhead(() => handler(req))
          : await handler(req);
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
          err instanceof Prisma.PrismaClientUnknownRequestError ||
          err instanceof Prisma.PrismaClientRustPanicError ||
          err instanceof Prisma.PrismaClientValidationError ||
          err instanceof Prisma.PrismaClientInitializationError;
        const safeErr = isPrismaError ? handlePrismaError(err) : errorFrom(err);
        const code =
          err instanceof CodedRpcError ? err.code : RpcFailureCodes.HandlerError;
        return makeRpcFailure(req.id, safeErr.message ?? "Internal error", code, {
          retryable:
            err instanceof CodedRpcError ? err.retryable : RpcRetryableByDefault[code],
          retryAfterMs: err instanceof CodedRpcError ? err.retryAfterMs : undefined,
        });
      }
    },
  );
}

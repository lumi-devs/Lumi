import { container } from "#src/lib/Services.js";
import { Prisma } from "@prisma/client";
import {
  extractTraceContext,
  otelContext,
  runWithContext,
  withSpan,
  semaphoreInFlight,
  semaphoreQueued,
  semaphoreRejectedTotal,
} from "#src/observability/Index.ts";
import {
  CodedRpcError,
  makeRpcFailure,
  rpcRouter,
  RpcFailureCodes,
  RpcRetryableByDefault,
  type RpcRequest,
  type RpcResponse,
} from "#src/contracts/rpc/Index.ts";
import {
  resolveRpcDiscordBulkheadQueueLimit,
  resolveRpcDiscordBulkheadSize,
} from "#src/lib/Env.js";
import { getRpcHandler } from "#src/lib/rpc/Registry.js";
import { Semaphore, SemaphoreQueueFullError } from "#src/lib/utilities/Concurrency.js";
import { errorFrom, logError } from "#src/lib/utilities/Errors.js";

const DiscordBulkheadName = "rpc-discord";
let discordBulkhead = new Semaphore(resolveRpcDiscordBulkheadSize(), {
  name: DiscordBulkheadName,
  maxQueueLength: resolveRpcDiscordBulkheadQueueLimit(),
});

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

  const parentCtx = extractTraceContext({
    traceparent: req.traceparent,
    tracestate: req.tracestate,
  });

  return otelContext.with(parentCtx, () =>
    runWithContext(
      {
        correlationId: req.id,
        source: "rpc",
        name: req.action,
        guildId: req.guildId,
        userId: req.actorId,
      },
      async (): Promise<RpcResponse> =>
        withSpan(`rpc.${req.action}`, async (span) => {
          span.setAttribute("rpc.action", req.action);
          span.setAttribute("rpc.id", req.id);
          if (req.guildId) span.setAttribute("rpc.guildId", req.guildId);
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
            span.setAttribute("rpc.ok", false);
            if (err instanceof CodedRpcError) span.setAttribute("rpc.code", err.code);
            logError(`RPC: ${req.action} error`, err);
            container.logger.error(`[RPC] ${req.action} failed`, {
              durationMs: Date.now() - startedAt,
            });

            const isPrismaError =
              err instanceof Prisma.PrismaClientKnownRequestError ||
              err instanceof Prisma.PrismaClientUnknownRequestError ||
              err instanceof Prisma.PrismaClientRustPanicError ||
              err instanceof Prisma.PrismaClientValidationError ||
              err instanceof Prisma.PrismaClientInitializationError;
            const safeErr =
              isPrismaError && err instanceof Prisma.PrismaClientKnownRequestError
                ? new Error(
                    err.code === "P2002"
                      ? "Unique constraint violation."
                      : err.code === "P2025"
                        ? "Record not found."
                        : err.code === "P1008"
                          ? "Operation timed out."
                          : `Database error occurred (code: ${err.code}).`,
                  )
                : isPrismaError
                  ? new Error("Database error occurred.")
                  : errorFrom(err);
            const code =
              err instanceof CodedRpcError ? err.code : RpcFailureCodes.HandlerError;
            return makeRpcFailure(req.id, safeErr.message ?? "Internal error", code, {
              retryable:
                err instanceof CodedRpcError ? err.retryable : RpcRetryableByDefault[code],
              retryAfterMs: err instanceof CodedRpcError ? err.retryAfterMs : undefined,
            });
          }
        }),
    ),
  );
}

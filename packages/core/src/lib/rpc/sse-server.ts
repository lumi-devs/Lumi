import { randomUUID } from "node:crypto";
import { container } from "@sapphire/framework";
import { DashboardEventStream, type DashboardEvent } from "@lumi/contracts/events";
import { CodedRpcError, RpcFailureCodes } from "@lumi/contracts/rpc";
import { requireGuildId, requireGuildManager } from "#lib/rpc/implement.js";

/**
 * Per-process cap on concurrent SSE connections. This process only ever
 * serves the dashboard, so a few hundred simultaneous tabs is generous
 * headroom without letting a runaway client (or a bug in the dashboard's
 * reconnect logic) pile up unbounded Redis consumer groups.
 */
export const MaxSseConnections = 200;

/** Drop-oldest cap on events queued per connection between ticks of the event loop. */
const MaxBufferedEvents = 50;

/** Heartbeat comment line, keeps the connection open through idle-timeout proxies. */
const HeartbeatIntervalMs = 15_000;

interface SseConnection {
  close: () => Promise<void>;
}

const activeConnections = new Set<SseConnection>();

function errorResponse(err: unknown): Response {
  const code = err instanceof CodedRpcError ? err.code : RpcFailureCodes.Internal;
  const status =
    code === RpcFailureCodes.Forbidden
      ? 403
      : code === RpcFailureCodes.GuildNotFound
        ? 404
        : code === RpcFailureCodes.BadRequest
          ? 400
          : 500;
  return Response.json(
    { ok: false, error: err instanceof Error ? err.message : "Forbidden", code },
    { status },
  );
}

/**
 * GET /events?guildId=...&actorId=...
 *
 * Internal-only: the caller (apps/dashboard's server-side route handler,
 * per the SSE plan's later slice) already passed the same
 * `RPC_INTERNAL_TOKEN` bearer check `http-server.ts` runs for `/rpc`, so this
 * function only owns the guild-scoping half - `actorId`/`guildId` are
 * unsigned claims exactly like an `/rpc` body, re-verified live against
 * Discord (`requireGuildManager`'s uncached REST check) rather than trusted
 * from the query string.
 */
export async function handleSseRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  let guildId: string;
  let actorId: string;
  try {
    guildId = requireGuildId(url.searchParams.get("guildId"));
    actorId = await requireGuildManager(guildId, url.searchParams.get("actorId") ?? undefined);
  } catch (err) {
    return errorResponse(err);
  }

  if (activeConnections.size >= MaxSseConnections) {
    return new Response("Too many SSE connections", { status: 503 });
  }

  const encoder = new TextEncoder();
  const group = `sse-${randomUUID()}`;
  const consumer = "sse";
  let stopConsume: (() => Promise<void>) | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let connectionEntry: SseConnection;

  const close = async () => {
    if (closed) return;
    closed = true;
    activeConnections.delete(connectionEntry);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (stopConsume) await stopConsume().catch(() => undefined);
    await container.eventBus
      .destroyGroup(DashboardEventStream, group)
      .catch(() => undefined);
  };
  connectionEntry = { close };
  activeConnections.add(connectionEntry);

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let queued = 0;
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          void close();
        }
      };

      heartbeatTimer = setInterval(() => send(": hb\n\n"), HeartbeatIntervalMs);

      // Own consumer group starting at `$` (new entries only): Redis Streams
      // delivers the full stream independently to each group, so this is a
      // broadcast fan-out to every open dashboard tab, not a work queue - and
      // starting at `$` skips replaying history a freshly opened tab never
      // asked for. Torn down on disconnect via destroyGroup() (see `close`)
      // so restarts/reconnects don't leak one dead group per session, per
      // event-bus/types.ts's destroyGroup contract.
      container.eventBus
        .consume<DashboardEvent>(
          [DashboardEventStream],
          { group, consumer, startId: "$" },
          async (msg) => {
            await msg.ack();
            if (msg.body.guildId !== guildId) return;
            // Bounded queue depth: a burst that outpaces this tick just drops
            // the oldest entry rather than growing without limit - a
            // reconnect (or the dashboard's own RPC refetch) recovers state,
            // so losing a stale intermediate event here is fine.
            if (queued >= MaxBufferedEvents) return;
            queued++;
            send(`data: ${JSON.stringify(msg.body)}\n\n`);
            queued--;
          },
        )
        .then((stop) => {
          stopConsume = stop;
          if (closed) void stop();
        })
        .catch((err: unknown) => {
          container.logger?.error?.("[Sse] event bus consume failed", {
            guildId,
            err: err instanceof Error ? err.message : String(err),
          });
          void close();
        });
    },
    cancel() {
      void close();
    },
  });

  container.logger?.info?.("[Sse] connection opened", { guildId, actorId, group });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // Disables response buffering on nginx-fronted deployments; harmless
      // elsewhere.
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Closes every open SSE connection. Called from `apps/api`'s drain sequence
 * ahead of the event-bus/redis teardown (`api-bootstrap.ts`'s
 * `extraDrainSteps`), so each connection's own cleanup - stopping its
 * consume loop and destroying its ephemeral consumer group - runs while
 * Redis is still reachable, instead of racing a hard connection close.
 */
export async function closeAllSseConnections(): Promise<void> {
  await Promise.all([...activeConnections].map((c) => c.close()));
}

/** Test-only accessor - avoids a parallel "reset internal state" export. */
export function _activeSseConnectionCount(): number {
  return activeConnections.size;
}

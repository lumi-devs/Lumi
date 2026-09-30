import { randomUUID } from "node:crypto";
import { container } from "@sapphire/framework";
import {
  DashboardEventSchema,
  DashboardEventStream,
  type DashboardEvent,
} from "@lumi/contracts/events";
import { dashboardEventPublishFailures } from "@lumi/observability";
import { CodedRpcError, RpcFailureCodes } from "@lumi/contracts/rpc";
import { requireGuildId, requireGuildManager } from "#lib/rpc/implement.js";
import type { BusMessage } from "#lib/event-bus/types.js";

/**
 * Per-process cap on concurrent SSE connections. This process only ever
 * serves the dashboard, so a few hundred simultaneous tabs is generous
 * headroom without letting a runaway client (or a bug in the dashboard's
 * reconnect logic) pile up unbounded state.
 */
export const MaxSseConnections = 200;

/** Per-connection cap on events queued between successful sends. Past this, the connection is treated as stuck and closed rather than buffered further. */
const MaxBufferedEvents = 50;

/** Heartbeat comment line, keeps the connection open through idle-timeout proxies. */
const HeartbeatIntervalMs = 15_000;

interface Connection {
  guildId: string;
  queued: number;
  send: (chunk: string) => void;
  close: () => Promise<void>;
}

/**
 * Every open connection, keyed by the guild it's scoped to, for in-memory
 * fan-out. All state below is process-local - `apps/api` runs single-
 * threaded per replica, so no cross-process coordination is needed beyond
 * the one shared Redis subscription itself.
 */
const connectionsByGuild = new Map<string, Set<Connection>>();
const allConnections = new Set<Connection>();

interface SharedSubscription {
  group: string;
  stop: () => Promise<void>;
}

/**
 * One shared consumer group per apps/api process, not one per SSE
 * connection: `RedisStreamsBus.consume()` opens a dedicated blocking Redis
 * connection per call (see `RedisStreamsBus.ts`'s `readConn = this.subscriber.duplicate()`),
 * so a per-connection group would mean one Redis connection per open
 * dashboard tab. Started lazily on the first connection
 * (`ensureSubscriptionStarted`) and torn down once the last one closes
 * (`releaseSubscriptionIfIdle`), with events fanned out in-memory via
 * `connectionsByGuild` instead of one Redis read per tab.
 */
let subscription: SharedSubscription | null = null;
let starting: Promise<void> | null = null;

async function handleIncoming(msg: BusMessage<DashboardEvent>): Promise<void> {
  await msg.ack();
  const validated = DashboardEventSchema.run(msg.body);
  if (validated.isErr()) {
    dashboardEventPublishFailures.inc({ reason: "invalid" });
    container.logger?.warn?.("[Sse] dropping malformed dashboard event", {
      err: validated.error.message,
    });
    return;
  }
  const body = validated.unwrap();
  const conns = connectionsByGuild.get(body.guildId);
  if (!conns || conns.size === 0) return;
  const chunk = `data: ${JSON.stringify(body)}\n\n`;
  // Snapshot before iterating: a connection's own close() (triggered below
  // on a failed/overloaded send) mutates `conns` mid-loop, and one slow or
  // disconnected client must never stop delivery to the rest.
  for (const conn of [...conns]) {
    if (conn.queued >= MaxBufferedEvents) {
      void conn.close();
      continue;
    }
    conn.queued++;
    try {
      conn.send(chunk);
    } catch {
      void conn.close();
    } finally {
      conn.queued = Math.max(0, conn.queued - 1);
    }
  }
}

async function ensureSubscriptionStarted(): Promise<void> {
  if (subscription) return;
  if (!starting) {
    starting = (async () => {
      const group = `sse-${randomUUID()}`;
      const stop = await container.eventBus.consume<DashboardEvent>(
        [DashboardEventStream],
        { group, consumer: "sse", startId: "$" },
        handleIncoming,
      );
      subscription = { group, stop };
    })().finally(() => {
      starting = null;
    });
  }
  await starting;
}

/**
 * Tears the shared subscription down once nothing is left listening. Awaits
 * any in-flight start and re-checks `allConnections.size` afterward - a new
 * connection can register itself while a start is still resolving, and
 * tearing down right then would kill the subscription it's about to depend
 * on instead of racing it.
 */
async function releaseSubscriptionIfIdle(): Promise<void> {
  if (allConnections.size > 0) return;
  if (starting) {
    await starting.catch(() => undefined);
    if (allConnections.size > 0) return;
  }
  const current = subscription;
  if (!current) return;
  subscription = null;
  await current.stop().catch(() => undefined);
  await container.eventBus
    .destroyGroup(DashboardEventStream, current.group)
    .catch(() => undefined);
}

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
 * Internal-only: the caller (the dashboard's server-side route handler,
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

  if (allConnections.size >= MaxSseConnections) {
    return new Response("Too many SSE connections", { status: 503 });
  }

  const encoder = new TextEncoder();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let connection: Connection | null = null;

  const close = async () => {
    if (closed) return;
    closed = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (connection) {
      allConnections.delete(connection);
      const guildSet = connectionsByGuild.get(guildId);
      guildSet?.delete(connection);
      if (guildSet && guildSet.size === 0) connectionsByGuild.delete(guildId);
    }
    await releaseSubscriptionIfIdle();
  };

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      connection = {
        guildId,
        queued: 0,
        send: (chunk) => controller.enqueue(encoder.encode(chunk)),
        close,
      };
      allConnections.add(connection);
      let guildSet = connectionsByGuild.get(guildId);
      if (!guildSet) {
        guildSet = new Set();
        connectionsByGuild.set(guildId, guildSet);
      }
      guildSet.add(connection);

      heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": hb\n\n"));
        } catch {
          void close();
        }
      }, HeartbeatIntervalMs);

      void ensureSubscriptionStarted().catch((err: unknown) => {
        container.logger?.error?.("[Sse] failed to start shared subscription", {
          err: err instanceof Error ? err.message : String(err),
        });
        void close();
      });
    },
    cancel() {
      void close();
    },
  });

  container.logger?.info?.("[Sse] connection opened", { guildId, actorId });

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
 * `extraDrainSteps`), so each connection's own cleanup runs, and the last
 * one to go tears down the shared subscription, while Redis is still
 * reachable, instead of racing a hard connection close.
 */
export async function closeAllSseConnections(): Promise<void> {
  await Promise.all([...allConnections].map((c) => c.close()));
}

/** Test-only accessor - avoids a parallel "reset internal state" export. */
export function _activeSseConnectionCount(): number {
  return allConnections.size;
}

import { randomUUID } from "node:crypto";
import { container } from "#src/lib/Services.js";
import {
  DashboardEventSchema,
  DashboardEventStream,
  type DashboardEvent,
} from "#src/contracts/Events.js";
import { dashboardEventPublishFailures } from "#src/observability/Index.ts";
import { CodedRpcError, RpcFailureCodes } from "#src/contracts/rpc/Index.ts";
import { requireGuildId, requireGuildManager } from "#src/lib/rpc/Implement.js";
import type { BusMessage } from "#src/lib/event-bus/Types.js";

export const MaxSseConnections = 200;

const MaxBufferedEvents = 50;

const HeartbeatIntervalMs = 15_000;

interface Connection {
  guildId: string;
  queued: number;
  send: (chunk: string) => void;
  close: () => Promise<void>;
}

const connectionsByGuild = new Map<string, Set<Connection>>();
const allConnections = new Set<Connection>();

interface SharedSubscription {
  group: string;
  stop: () => Promise<void>;
}

let subscription: SharedSubscription | null = null;
let starting: Promise<void> | null = null;

async function handleIncoming(msg: BusMessage<DashboardEvent>): Promise<void> {
  await msg.ack();
  const validated = DashboardEventSchema.safeParse(msg.body);
  if (!validated.success) {
    dashboardEventPublishFailures.inc({ reason: "invalid" });
    container.logger?.warn?.("[Sse] dropping malformed dashboard event", {
      err: validated.error.message,
    });
    return;
  }
  const body = validated.data;
  const conns = connectionsByGuild.get(body.guildId);
  if (!conns || conns.size === 0) return;
  const chunk = `data: ${JSON.stringify(body)}\n\n`;

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

  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  const close = async () => {
    if (closed) return;
    closed = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (streamController) {
      try {
        streamController.close();
      } catch {
        // Stream may already be closed by consumer
      }
      streamController = null;
    }
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
      streamController = controller;
      connection = {
        guildId,
        queued: 0,
        send: (chunk) => {
          controller.enqueue(encoder.encode(chunk));
        },
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

      "X-Accel-Buffering": "no",
    },
  });
}

export async function closeAllSseConnections(): Promise<void> {
  await Promise.all([...allConnections].map((c) => c.close()));
}

export function _activeSseConnectionCount(): number {
  return allConnections.size;
}

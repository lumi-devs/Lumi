import { registry } from "./metrics.js";

export interface Logger {
  info: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
  error: (message: string, meta?: unknown) => void;
  debug: (message: string, meta?: unknown) => void;
}

export interface MetricsServer {
  stop(): void;
}

export function startMetricsServer(
  port: number,
  isReady: () => boolean,
  logger: Logger,
): MetricsServer {
  const server = Bun.serve({
    port,
    fetch: async (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/metrics") {
        return new Response(await registry.metrics(), {
          headers: { "content-type": registry.contentType },
        });
      }
      if (url.pathname === "/healthz") {
        const ready = isReady();
        return Response.json({ ok: ready }, { status: ready ? 200 : 503 });
      }
      return new Response("not found", { status: 404 });
    },
  });

  logger.info(`metrics server listening on port ${port}`);

  return {
    stop: () => server.stop(true),
  };
}

import type { Logger } from "@lumi/foundation";
import { registry } from "./metrics.ts";

export interface MetricsServer {
  stop(): void;
}

export function startMetricsServer(port: number, ready: () => boolean, logger: Logger): MetricsServer {
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
        const ok = ready();
        return Response.json({ ok }, { status: ok ? 200 : 503 });
      }
      return new Response("not found", { status: 404 });
    },
  });

  logger.info({ port }, "metrics server listening");

  return {
    stop: () => server.stop(true),
  };
}

import type { IncomingMessage, ServerResponse } from "node:http";
import type { ModuleLoader } from "@lumi/module-runtime";
import type { HealthMonitor } from "@lumi/observability";
import {
  httpRequestDuration,
  httpRequests,
} from "@lumi/observability";
import type { Client } from "discord.js";

export interface StatusRouteOptions {
  client: Client;
  healthMonitor: HealthMonitor;
  moduleLoader: Pick<ModuleLoader, "listGlobal">;

  token: string | undefined;
}






export function createStatusHandler(
  options: StatusRouteOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const { client, healthMonitor, moduleLoader, token } = options;

  return async function handleStatusRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const startedAt = performance.now();
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const route = url.pathname;
    const method = req.method ?? "GET";

    const finish = (status: number, body: unknown): void => {
      const seconds = (performance.now() - startedAt) / 1000;
      httpRequests.inc({ method, route, status: String(status) });
      httpRequestDuration.observe(
        { method, route, status: String(status) },
        seconds,
      );
      res.setHeader("content-type", "application/json");
      res.statusCode = status;
      res.end(JSON.stringify(body));
    };

    if (route === "/healthz") {
      const checks = await healthMonitor.runChecks();
      finish(checks.healthy ? 200 : 503, {
        ok: checks.healthy,
        ready: client.isReady(),
        checks: checks.results,
      });
      return;
    }

    if (route === "/ready" || route === "/readyz") {
      finish(client.isReady() ? 200 : 503, { ready: client.isReady() });
      return;
    }

    if (route === "/api/v1/status") {
      if (token && req.headers.authorization !== `Bearer ${token}`) {
        finish(401, { error: "unauthorized" });
        return;
      }
      finish(200, {
        bot: client.user?.tag ?? null,
        guilds: client.guilds.cache.size,
        users: client.users.cache.size,
        modules: moduleLoader.listGlobal(),
      });
      return;
    }

    finish(404, { error: "not found" });
  };
}

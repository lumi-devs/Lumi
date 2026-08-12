import { dispatchRpc } from "#lib/rpc/dispatch.js";
import { envParseInteger, envParseString } from "#lib/env.js";
import { logError } from "#lib/utilities/errors.js";
import type { RpcRequest } from "@lumi/contracts";

/**
 * Internal-only HTTP entry point for the `dispatchRpc` pipeline — handler
 * lookup, dashboard-enabled check, tracing/error shape. Exists so the
 * dashboard can call the worker directly over the docker network, mirroring
 * how Skyra (`src/routes/`) and YAGPDB (`bot/botrest/`) expose their bot
 * process to their own dashboards. Never bound to a published port —
 * reachable only from other containers on the compose network (no
 * additional auth layer here either).
 */
export function startRpcHttpServer(
  log: (level: "info" | "warn" | "error", msg: string, meta?: object) => void,
): void {
  const port = envParseInteger("RPC_HTTP_PORT", 8091);
  const host = envParseString("RPC_HTTP_HOST", "0.0.0.0");

  try {
    Bun.serve({
      hostname: host,
      port,
      async fetch(req) {
        const { pathname } = new URL(req.url);
        if (req.method === "GET" && pathname === "/healthz") {
          return new Response("ok");
        }
        if (req.method !== "POST" || pathname !== "/rpc") {
          return new Response("not found", { status: 404 });
        }
        let body: RpcRequest<unknown>;
        try {
          body = (await req.json()) as RpcRequest<unknown>;
        } catch {
          return Response.json(
            { id: "", ok: false, error: "Malformed JSON body" },
            { status: 400 },
          );
        }
        if (!body?.action) {
          return Response.json(
            { id: body?.id ?? "", ok: false, error: "Missing action" },
            { status: 400 },
          );
        }
        const res = await dispatchRpc(body);
        return Response.json(res);
      },
    });
    log("info", "[RpcHttp] Internal RPC HTTP server listening", { host, port });
  } catch (err: unknown) {
    // Mirrors the metrics server's stance: a bind failure here must never
    // take the worker down.
    logError("[RpcHttp] Failed to start internal RPC HTTP server", err);
  }
}

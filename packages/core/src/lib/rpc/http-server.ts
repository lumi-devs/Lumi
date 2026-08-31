import { createHash, timingSafeEqual } from "node:crypto";
import { dispatchRpc } from "#lib/rpc/dispatch.js";
import { envParseInteger, envParseString } from "#lib/env.js";
import { logError } from "#lib/utilities/errors.js";
import type { RpcRequest } from "@lumi/contracts";

/**
 * Internal-only HTTP entry point for the `dispatchRpc` pipeline — handler
 * lookup, dashboard-enabled check, tracing/error shape. Exists so the
 * dashboard can call the worker directly over the docker network, mirroring
 * how Skyra (`src/routes/`) and YAGPDB (`bot/botrest/`) expose their bot
 * process to their own dashboards.
 *
 * Reachability is not authorization: every container on the compose network
 * (and anything with an SSRF primitive pointed at it) can open a socket here,
 * and `actorId` in the request body is an unsigned claim the handlers act on
 * — `requireBotOwner` would happily accept the bot owner's public snowflake
 * from a stranger. So every `/rpc` request must carry the shared secret in
 * `RPC_INTERNAL_TOKEN`, checked here before the body ever reaches
 * `dispatchRpc`.
 */

const AUTH_HEADER = "authorization";
const BEARER_PREFIX = "Bearer ";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Constant-time compare over SHA-256 digests rather than the raw strings, so
 * neither the byte values nor the token *length* leak through timing.
 */
export function tokenMatches(expected: string, presented: string | null): boolean {
  if (!presented) return false;
  return timingSafeEqual(digest(expected), digest(presented));
}

export function presentedToken(req: Request): string | null {
  const header = req.headers.get(AUTH_HEADER);
  if (!header?.startsWith(BEARER_PREFIX)) return null;
  const value = header.slice(BEARER_PREFIX.length).trim();
  return value.length > 0 ? value : null;
}

export function readInternalToken(
  log: (level: "info" | "warn" | "error", msg: string, meta?: object) => void,
): string | null {
  const token = process.env["RPC_INTERNAL_TOKEN"]?.trim();
  if (token) return token;

  // Refusing to boot is the only safe answer in production: starting without
  // it would silently serve owner-gated actions to anyone who can reach the
  // port.
  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "[ENV] Missing: RPC_INTERNAL_TOKEN — the internal RPC server refuses to " +
        "start unauthenticated in production. Generate one with " +
        "`openssl rand -hex 32` and set it identically on the worker and the dashboard.",
    );
  }
  log(
    "warn",
    "[RpcHttp] RPC_INTERNAL_TOKEN is unset — the internal RPC server is running " +
      "WITHOUT authentication. Acceptable only for local development on a " +
      "loopback bind; set it before exposing RPC_HTTP_HOST beyond 127.0.0.1.",
  );
  return null;
}

export async function handleRpcHttpRequest(
  req: Request,
  internalToken: string | null,
): Promise<Response> {
  const { pathname } = new URL(req.url);
  // Unauthenticated on purpose: liveness/readiness probes have no way to
  // hold the secret, and it discloses nothing beyond "the process is up".
  if (req.method === "GET" && pathname === "/healthz") {
    return new Response("ok");
  }
  if (req.method !== "POST" || pathname !== "/rpc") {
    return new Response("not found", { status: 404 });
  }
  if (internalToken && !tokenMatches(internalToken, presentedToken(req))) {
    return Response.json(
      { id: "", ok: false, error: "Unauthorized" },
      { status: 401 },
    );
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
}

export async function startRpcHttpServer(
  log: (level: "info" | "warn" | "error", msg: string, meta?: object) => void,
  maxAttempts = 3,
  initialDelayMs = 500,
): Promise<ReturnType<typeof Bun.serve> | null> {
  const port = envParseInteger("RPC_HTTP_PORT", 8091);
  // Loopback by default: an operator whose dashboard runs in a separate
  // container/pod opts into a routable bind explicitly (see docker-compose.yml,
  // where only the RPC-serving services set 0.0.0.0).
  const host = envParseString("RPC_HTTP_HOST", "127.0.0.1");
  const internalToken = readInternalToken(log);

  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      const server = Bun.serve({
        hostname: host,
        port,
        fetch(req) {
          return handleRpcHttpRequest(req, internalToken);
        },
      });
      log("info", "[RpcHttp] Internal RPC HTTP server listening", {
        host,
        port,
        authenticated: internalToken !== null,
      });
      return server;
    } catch (err: unknown) {
      if (attempt < maxAttempts) {
        const delay = initialDelayMs * Math.pow(2, attempt - 1);
        log(
          "warn",
          `[RpcHttp] Failed to bind internal RPC HTTP server on attempt ${attempt}/${maxAttempts}, retrying in ${delay}ms`,
          { host, port, error: err instanceof Error ? err.message : String(err) },
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // Mirrors the metrics server's stance: a bind failure here must never
        // take the worker down.
        log("error", "[RpcHttp] Failed to start internal RPC HTTP server", {
          host,
          port,
          error: err instanceof Error ? err.message : String(err),
        });
        try {
          logError("RpcHttp: Failed to start internal RPC HTTP server", err);
        } catch {
          // Container logger may not be available in isolated test environments
        }
        return null;
      }
    }
  }
  return null;
}

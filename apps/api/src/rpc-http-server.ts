import { createHash, timingSafeEqual } from "node:crypto";
import { container } from "@sapphire/framework";
import {
  dispatchRpc,
  GdprExportSigningKeyUnavailable,
  handleSseRequest,
  logError,
  verifyGdprExportToken,
} from "@lumi/core";
import {
  envParseInteger,
  envParseString,
  getRpcInternalToken,
  isProduction,
} from "@lumi/core/env";
import {
  CONTRACT_VERSION,
  contractVersionsCompatible,
  makeRpcFailure,
  RpcFailureCodes,
  type RpcRequest,
} from "@lumi/contracts/rpc";

/** Internal HTTP server for dispatchRpc. Requires RPC_INTERNAL_TOKEN. */

const AuthHeader = "authorization";
const BearerPrefix = "Bearer ";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Constant-time comparison over SHA-256 digests to prevent timing leaks. */
export function tokenMatches(expected: string, presented: string | null): boolean {
  if (!presented) return false;
  return timingSafeEqual(digest(expected), digest(presented));
}

export function presentedToken(req: Request): string | null {
  const header = req.headers.get(AuthHeader);
  if (!header?.startsWith(BearerPrefix)) return null;
  const value = header.slice(BearerPrefix.length).trim();
  return value.length > 0 ? value : null;
}

export function readInternalToken(
  log: (level: "info" | "warn" | "error", msg: string, meta?: object) => void,
): string | null {
  const token = getRpcInternalToken();
  if (token) return token;

  // Refuse unauthenticated start in production.
  if (isProduction()) {
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

const ContractVersionHeader = "x-lumi-contract-version";

/** Validates contract compatibility using x-lumi-contract-version. */
function checkContractVersion(req: Request): Response | null {
  const theirVersion = req.headers.get(ContractVersionHeader);
  if (theirVersion && contractVersionsCompatible(CONTRACT_VERSION, theirVersion)) return null;
  const error = theirVersion
    ? `Contract version mismatch: caller is on @lumi/contracts@${theirVersion}, this server is on @lumi/contracts@${CONTRACT_VERSION}. Update one side to match.`
    : `Missing ${ContractVersionHeader} header: this server is on @lumi/contracts@${CONTRACT_VERSION} and requires callers to report their contract version.`;
  return Response.json(makeRpcFailure("", error, RpcFailureCodes.ContractMismatch), {
    status: 409,
  });
}

const GdprExportDownloadPath = "/gdpr-export";

/** Streams a completed GDPR export verified by signed download token. */
async function handleGdprExportDownload(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return Response.json({ error: "Missing token" }, { status: 400 });
  }

  let verification: ReturnType<typeof verifyGdprExportToken>;
  try {
    verification = verifyGdprExportToken(token);
  } catch (err) {
    if (err instanceof GdprExportSigningKeyUnavailable) {
      return Response.json({ error: "Export downloads are not configured" }, { status: 503 });
    }
    throw err;
  }

  if (!verification.valid) {
    return Response.json({ error: "Invalid or expired download link" }, { status: 401 });
  }

  const job = await container.db.gdprExportJobs.findById(verification.jobId);
  if (!job || job.status !== "done" || !job.filePath) {
    return Response.json({ error: "Export not found" }, { status: 404 });
  }
  if (!job.expiresAt || job.expiresAt.getTime() < Date.now()) {
    return Response.json({ error: "Export has expired" }, { status: 410 });
  }

  const file = Bun.file(job.filePath);
  if (!(await file.exists())) {
    return Response.json({ error: "Export file is no longer available" }, { status: 404 });
  }

  return new Response(file, {
    headers: {
      "content-type": "application/gzip",
      "content-disposition": `attachment; filename="lumi-user-data-${job.userId}.json.gz"`,
    },
  });
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
  // SSE gets the identical bearer-token gate before it ever reaches
  // `handleSseRequest`, then owns its own guild-scoping check from there -
  // same transport-level authentication as `/rpc`, just a streaming response
  // instead of a single JSON envelope.
  if (req.method === "GET" && pathname === "/events") {
    if (internalToken && !tokenMatches(internalToken, presentedToken(req))) {
      return Response.json(makeRpcFailure("", "Unauthorized", RpcFailureCodes.Unauthorized), {
        status: 401,
      });
    }
    return handleSseRequest(req);
  }
  if (req.method === "GET" && pathname === GdprExportDownloadPath) {
    return handleGdprExportDownload(req);
  }
  if (req.method !== "POST" || pathname !== "/rpc") {
    return new Response("not found", { status: 404 });
  }
  if (internalToken && !tokenMatches(internalToken, presentedToken(req))) {
    return Response.json(makeRpcFailure("", "Unauthorized", RpcFailureCodes.Unauthorized), {
      status: 401,
    });
  }
  const contractMismatch = checkContractVersion(req);
  if (contractMismatch) return contractMismatch;
  let body: RpcRequest<unknown>;
  try {
    body = (await req.json()) as RpcRequest<unknown>;
  } catch {
    return Response.json(makeRpcFailure("", "Malformed JSON body", RpcFailureCodes.BadRequest), {
      status: 400,
    });
  }
  if (!body?.action) {
    return Response.json(
      makeRpcFailure(body?.id ?? "", "Missing action", RpcFailureCodes.BadRequest),
      { status: 400 },
    );
  }
  try {
    return Response.json(await dispatchRpc(body));
  } catch {
    return Response.json(
      makeRpcFailure(body?.id ?? "", "Internal error", RpcFailureCodes.Internal),
      { status: 500 },
    );
  }
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
  if (!internalToken && host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error(
      "[ENV] RPC_INTERNAL_TOKEN is unset and RPC_HTTP_HOST is not loopback — " +
        "refusing to serve unauthenticated RPC on a routable interface. Set " +
        "RPC_INTERNAL_TOKEN or bind RPC_HTTP_HOST to 127.0.0.1.",
    );
  }

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
        error(err) {
          log("error", "[RpcHttp] Unhandled error during request processing:", {
            error: err instanceof Error ? err.message : String(err),
          });
          return Response.json(
            { error: "Internal Server Error", code: RpcFailureCodes.Internal, retryable: false },
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
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

import "server-only";

// Server-only environment configuration. Never import this from a Client
// Component — the `server-only` package makes that a build-time error.

function envStr(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value !== undefined && value !== "") return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`[ENV] Missing required variable: ${key}`);
}

function envInt(key: string, fallback?: number): number {
  const raw = process.env[key];
  if (raw !== undefined && raw.trim() !== "") {
    const n = Number.parseInt(raw.trim(), 10);
    if (!Number.isNaN(n)) return n;
    throw new Error(`[ENV] Invalid integer: ${key}=${raw}`);
  }
  if (fallback !== undefined) return fallback;
  throw new Error(`[ENV] Missing required variable: ${key}`);
}

// NextAuth reads AUTH_SECRET by convention; DASHBOARD_SESSION_SECRET is
// kept for deploy-config continuity with older deployments.
function resolveAuthSecret(): string {
  return envStr(
    "DASHBOARD_SESSION_SECRET",
    process.env["AUTH_SECRET"] ||
      "dummy_session_secret_for_nextjs_build_and_bootstrap_32chars_long",
  );
}

function resolveTrustedHops(): number {
  const raw = Number.parseInt(process.env["TRUSTED_PROXY_HOPS"] ?? "", 10);
  return Number.isInteger(raw) && raw > 0 ? raw : 1;
}

export const env = {
  /** Internal-only HTTP RPC bridge to the worker, e.g. "http://worker:8091". */
  rpcHttpUrl: envStr("RPC_HTTP_URL", "http://127.0.0.1:8091"),
  /** Shared secret sent as `Authorization: Bearer` on every RPC call. Must
   *  match the worker's `RPC_INTERNAL_TOKEN` — without it the worker rejects
   *  the dashboard with 401. Optional only so a local dev worker without the
   *  token still works. */
  rpcInternalToken: envStr("RPC_INTERNAL_TOKEN", ""),
  discordClientId: envStr("DISCORD_OAUTH2_CLIENT_ID", "dummy_discord_client_id"),
  discordClientSecret: envStr("DISCORD_OAUTH2_CLIENT_SECRET", "dummy_discord_client_secret"),
  /** NextAuth session/JWT encryption secret. */
  authSecret: resolveAuthSecret(),
  host: envStr("DASHBOARD_HOST", "0.0.0.0"),
  port: envInt("DASHBOARD_PORT", 8080),
  get redisUrl(): string | undefined {
    return process.env["REDIS_URL"] || undefined;
  },
  get trustedProxyHops(): number {
    return resolveTrustedHops();
  },
  get clientIpHeader(): string | undefined {
    return process.env["CLIENT_IP_HEADER"]?.trim().toLowerCase() || undefined;
  },
  get isDevelopment(): boolean {
    return (process.env["NODE_ENV"] || "development") === "development";
  },
  get isProduction(): boolean {
    return process.env["NODE_ENV"] === "production";
  },
} as const;


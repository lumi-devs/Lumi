import "server-only";

// Server-only environment configuration. Never import this from a Client
// Component — the `server-only` package makes that a build-time error.

function getEnv(name: string, fallback = ""): string {
  return process.env[name] || fallback;
}

export const env = {
  /** Internal-only HTTP RPC bridge to the worker, e.g. "http://worker:8091". */
  rpcHttpUrl: getEnv("RPC_HTTP_URL", "http://127.0.0.1:8091"),
  /** Shared secret sent as `Authorization: Bearer` on every RPC call. Must
   *  match the worker's `RPC_INTERNAL_TOKEN` — without it the worker rejects
   *  the dashboard with 401, since `actorId` alone proves nothing. Optional
   *  only so a local worker running without the token still works in dev. */
  rpcInternalToken: getEnv("RPC_INTERNAL_TOKEN"),
  discordClientId: getEnv("DISCORD_OAUTH2_CLIENT_ID", "dummy_discord_client_id"),
  discordClientSecret: getEnv("DISCORD_OAUTH2_CLIENT_SECRET", "dummy_discord_client_secret"),
  /** NextAuth session/JWT encryption secret — replaces the old hand-rolled
   *  HMAC signing key (`DASHBOARD_SESSION_SECRET`). Same env var name is
   *  kept for deploy-config continuity; NextAuth reads `AUTH_SECRET` by
   *  convention, so main.ts-equivalent bootstrapping mirrors it in here. */
  authSecret: getEnv(
    "DASHBOARD_SESSION_SECRET",
    getEnv(
      "AUTH_SECRET",
      "dummy_session_secret_for_nextjs_build_and_bootstrap_32chars_long",
    ),
  ),
  host: getEnv("DASHBOARD_HOST", "0.0.0.0"),
  port: Number.parseInt(getEnv("DASHBOARD_PORT", "8080"), 10),
} as const;


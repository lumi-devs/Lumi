import "server-only";

// Server-only environment configuration. Never import this from a Client
// Component — the `server-only` package makes that a build-time error.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  rabbitUrl: required("RABBITMQ_URL"),
  discordClientId: required("DISCORD_OAUTH2_CLIENT_ID"),
  discordClientSecret: required("DISCORD_OAUTH2_CLIENT_SECRET"),
  /** NextAuth session/JWT encryption secret — replaces the old hand-rolled
   *  HMAC signing key (`DASHBOARD_SESSION_SECRET`). Same env var name is
   *  kept for deploy-config continuity; NextAuth reads `AUTH_SECRET` by
   *  convention, so main.ts-equivalent bootstrapping mirrors it in here. */
  authSecret: required("DASHBOARD_SESSION_SECRET"),
  host: optional("DASHBOARD_HOST", "0.0.0.0"),
  port: Number.parseInt(optional("DASHBOARD_PORT", "8080"), 10),
} as const;

/** Environment configuration for the dashboard, validated once at startup. */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  /** RabbitMQ connection URL — the RPC bridge to the bot workers. */
  rabbitUrl: optional("RABBITMQ_URL", "amqp://guest:guest@localhost:5672"),

  /** Discord OAuth2 application credentials. */
  clientId: optional("DISCORD_OAUTH2_CLIENT_ID", "mock_client_id"),
  clientSecret: optional("DISCORD_OAUTH2_CLIENT_SECRET", "mock_client_secret"),
  redirectUri: optional(
    "DISCORD_OAUTH2_REDIRECT_URI",
    "http://localhost:8080/callback",
  ),

  /** HMAC secret for signing session/state cookies. */
  sessionSecret: optional(
    "DASHBOARD_SESSION_SECRET",
    "mock_session_secret_key_32_bytes_long!!",
  ),

  host: optional("DASHBOARD_HOST", "0.0.0.0"),
  port: Number(optional("DASHBOARD_PORT", "8080")),

  /** Set `true` behind an HTTPS reverse proxy so cookies carry the Secure flag. */
  secureCookies: optional("DASHBOARD_SECURE_COOKIES", "false") === "true",
} as const;

/** How long a login session stays valid before re-authentication is required. */
export const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

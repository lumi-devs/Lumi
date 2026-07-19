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
  rabbitUrl: required("RABBITMQ_URL"),

  /** Discord OAuth2 application credentials. */
  clientId: required("DISCORD_OAUTH2_CLIENT_ID"),
  clientSecret: required("DISCORD_OAUTH2_CLIENT_SECRET"),
  redirectUri: required("DISCORD_OAUTH2_REDIRECT_URI"),

  /** HMAC secret for signing session/state cookies. */
  sessionSecret: required("DASHBOARD_SESSION_SECRET"),

  host: optional("DASHBOARD_HOST", "0.0.0.0"),
  port: Number(optional("DASHBOARD_PORT", "8080")),

  /** Set `true` behind an HTTPS reverse proxy so cookies carry the Secure flag. */
  secureCookies: optional("DASHBOARD_SECURE_COOKIES", "false") === "true",
} as const;

/** How long a login session stays valid before re-authentication is required. */
export const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

import { envParseString, envParseInteger } from "#lib/env.js";

export const config = {
  rabbitUrl: envParseString("RABBITMQ_URL"),
  clientId: envParseString("DISCORD_OAUTH2_CLIENT_ID"),
  clientSecret: envParseString("DISCORD_OAUTH2_CLIENT_SECRET"),
  redirectUri: envParseString("DISCORD_OAUTH2_REDIRECT_URI"),
  sessionSecret: envParseString("DASHBOARD_SESSION_SECRET"),
  host: envParseString("DASHBOARD_HOST", "0.0.0.0"),
  port: envParseInteger("DASHBOARD_PORT", 8080),
  secureCookies: envParseString("DASHBOARD_SECURE_COOKIES", "false") === "true",
} as const;

export const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

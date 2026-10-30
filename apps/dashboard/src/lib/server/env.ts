const Trim = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

function required(name: string): string {
  const value = Trim(process.env[name]);
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See apps/dashboard/.env.example.`,
    );
  }
  return value;
}

export interface ServerConfig {
  discordClientId: string;
  discordClientSecret: string;
  redirectUri: string;
  sessionSecret: string;
  sessionTtlSeconds: number;
  databaseUrl: string;
  botToken: string;
  webBaseUrl: string;
  cookieSecure: boolean;
  redisUrl: string | null;
  redisHost: string;
  redisPort: number;
  redisPassword: string | null;
  redisDb: number;
  dataDir: string;
  modulesDir: string | null;
}

let cached: ServerConfig | null = null;

export function serverConfig(): ServerConfig {
  if (cached) return cached;

  const webBaseUrl = Trim(process.env.WEB_BASE_URL) ?? "http://localhost:4173";
  const sessionSecret = required("SESSION_SECRET");
  if (sessionSecret.length < 16) {
    throw new Error("SESSION_SECRET must be at least 16 characters.");
  }

  const port = Number(process.env.REDIS_PORT ?? 6379);
  const db = Number(process.env.REDIS_DB ?? 0);
  const ttl = Number(process.env.SESSION_TTL_SECONDS ?? 604_800);

  cached = {
    discordClientId: required("DISCORD_CLIENT_ID"),
    discordClientSecret: required("DISCORD_CLIENT_SECRET"),
    redirectUri:
      Trim(process.env.DISCORD_OAUTH_REDIRECT_URI) ??
      `${webBaseUrl.replace(/\/$/, "")}/auth/callback`,
    sessionSecret,
    sessionTtlSeconds: Number.isFinite(ttl) && ttl > 60 ? ttl : 604_800,
    databaseUrl:
      Trim(process.env.DATABASE_URL) ??
      Trim(process.env.DIRECT_POSTGRES_URL) ??
      Trim(process.env.POSTGRES_URL) ??
      "postgresql://lumi:lumi@127.0.0.1:5432/lumi",
    botToken: required("BOT_TOKEN"),
    webBaseUrl: webBaseUrl.replace(/\/$/, ""),
    cookieSecure:
      process.env.NODE_ENV === "production" &&
      process.env.DASHBOARD_INSECURE_COOKIES !== "1",
    redisUrl: Trim(process.env.REDIS_URL),
    redisHost: Trim(process.env.REDIS_HOST) ?? "localhost",
    redisPort: Number.isFinite(port) ? port : 6379,
    redisPassword: Trim(process.env.REDIS_PASSWORD),
    redisDb: Number.isFinite(db) ? db : 0,
    dataDir: Trim(process.env.LUMI_DATA_DIR) ?? "data",
    modulesDir: Trim(process.env.LUMI_MODULES_DIR),
  };

  return cached;
}

export function publicWebBaseUrl(): string {
  return (Trim(process.env.WEB_BASE_URL) ?? "http://localhost:4173").replace(
    /\/$/,
    "",
  );
}

function required(name: string): string {
  const value = Bun.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function integer(name: string, fallback: number): number {
  const raw = Bun.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid integer for ${name}: ${raw}`);
  return parsed;
}

export const env = {
  botToken: () => required("BOT_TOKEN"),
  postgresUrl: () => required("POSTGRES_URL"),
  redisUrl: () => Bun.env["REDIS_URL"] ?? "redis://localhost:6379/0",
  cacheNamespace: () => Bun.env["CACHE_NAMESPACE"] ?? "lumi",
  defaultPrefix: () => Bun.env["DEFAULT_PREFIX"] ?? ",",
  metricsPort: () => integer("METRICS_PORT", 9090),
  logLevel: () => Bun.env["LOG_LEVEL"] ?? "info",
  ownerIds: (): ReadonlySet<string> =>
    new Set(
      (Bun.env["OWNER_IDS"] ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
};
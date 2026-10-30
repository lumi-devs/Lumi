import type { RedisOptions } from "ioredis";

function databaseFromPath(pathname: string): number | undefined {
  const value = pathname.replace(/^\//, "");
  if (value.length === 0) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}





export function redisOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): RedisOptions {
  const url = env.REDIS_URL;
  if (url) {
    const parsed = new URL(url);
    const db = databaseFromPath(parsed.pathname);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
      ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
      ...(db === undefined ? {} : { db }),
    };
  }

  return {
    host: env.REDIS_HOST ?? "localhost",
    port: Number(env.REDIS_PORT ?? 6379),
    ...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
  };
}

import { Redis } from "ioredis";
import { redisOptionsFromEnv } from "../../src/core/redis.ts";
import { envRecord, isPlaceholder } from "./shared.ts";

export function validateRedisUrl(value: string): string | null {
  if (value.trim().length === 0) return "Missing REDIS_URL.";
  if (isPlaceholder(value)) {
    return "REDIS_URL still contains a placeholder value.";
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "REDIS_URL is not a valid URL.";
  }
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    return "REDIS_URL must start with redis:// or rediss://.";
  }
  if (!url.hostname) return "REDIS_URL is missing a hostname.";
  return null;
}

export function redisUrlFrom(values: ReadonlyMap<string, string>): string {
  const direct = values.get("REDIS_URL") ?? "";
  if (direct.length > 0) return direct;
  const host = values.get("REDIS_HOST") ?? "";
  if (host.length === 0) return "";
  const port = values.get("REDIS_PORT") ?? "6379";
  return `redis://${host}:${port}/${values.get("REDIS_DB") ?? "0"}`;
}

export async function checkRedis(
  values: ReadonlyMap<string, string>,
): Promise<string | null> {
  const client = new Redis({
    ...redisOptionsFromEnv(envRecord(values)),
    lazyConnect: true,
    connectTimeout: 3_000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  client.on("error", () => {});
  try {
    await client.connect();
    const reply = await client.ping();
    return reply === "PONG" ? null : `Unexpected PING reply: ${reply}`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    client.disconnect();
  }
}

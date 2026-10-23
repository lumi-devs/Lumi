import type { RedisClient } from "./client.ts";

const ReleaseScript = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

const RenewScript = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
end
return 0
`;

export async function claim(redis: RedisClient, key: string, ttlMs: number): Promise<boolean> {
  const result = await redis.set(key, crypto.randomUUID(), "PX", Math.max(1, ttlMs), "NX");
  return result === "OK";
}

export async function withLock<T>(
  redis: RedisClient,
  key: string,
  ttlMs: number,
  work: () => Promise<T>,
): Promise<{ acquired: true; value: T } | { acquired: false }> {
  const token = crypto.randomUUID();
  const result = await redis.set(key, token, "PX", Math.max(1, ttlMs), "NX");
  if (result !== "OK") return { acquired: false };

  // Keep the lock alive while the operation runs; a long install must not let a
  // second replica start the same module operation.
  const renew = setInterval(
    () => {
      void redis.eval(RenewScript, 1, key, token, String(Math.max(1, ttlMs))).catch(() => undefined);
    },
    Math.max(1_000, Math.floor(ttlMs / 3)),
  );
  renew.unref();

  try {
    return { acquired: true, value: await work() };
  } finally {
    clearInterval(renew);
    await redis.eval(ReleaseScript, 1, key, token).catch(() => undefined);
  }
}

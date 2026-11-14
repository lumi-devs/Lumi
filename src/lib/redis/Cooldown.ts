import type { Container } from "@lib/Services.js";

export async function claimCooldown(
  services: Container,
  key: string,
  ms: number,
): Promise<boolean> {
  if (ms <= 0) return true;
  try {
    const set = await services.redis.set(key, "1", "PX", Math.floor(ms), "NX");
    return set === "OK";
  } catch (err) {
    services.logger.warn("[Cooldown] Redis unavailable, failing closed:", err);
    return false;
  }
}

export async function isOnCooldown(
  services: Container,
  key: string,
): Promise<boolean> {
  return (await services.redis.exists(key)) === 1;
}

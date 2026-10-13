import type { Container } from "#src/lib/Services.js";

export async function claimCooldown(
  services: Container,
  key: string,
  ms: number,
): Promise<boolean> {
  if (ms <= 0) return true;
  try {
    const set = await services.valkey.set(key, "1", "PX", Math.floor(ms), "NX");
    return set === "OK";
  } catch (err) {
    services.logger.warn("[Cooldown] Valkey unavailable, failing closed:", err);
    return false;
  }
}

export async function isOnCooldown(
  services: Container,
  key: string,
): Promise<boolean> {
  return (await services.valkey.exists(key)) === 1;
}

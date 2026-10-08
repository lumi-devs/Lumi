import type { Container } from "#lib/services.js";

/**
 * Atomically take a cooldown slot. Returns true only for the caller that won
 * it - a separate check-then-set is a race, so this is the one function
 * every cooldown call site should use to claim a slot.
 */
export async function claimCooldown(
  services: Container,
  key: string,
  ms: number,
): Promise<boolean> {
  const set = await services.valkey.set(key, "1", "PX", ms, "NX");
  return set === "OK";
}

/** Read-only cooldown check - does not claim a slot. */
export async function isOnCooldown(
  services: Container,
  key: string,
): Promise<boolean> {
  return (await services.valkey.exists(key)) === 1;
}

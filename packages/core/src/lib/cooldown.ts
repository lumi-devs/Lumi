import { container } from "@sapphire/framework";

/**
 * Atomically take a cooldown slot. Returns true only for the caller that won
 * it - a separate check-then-set is a race, so this is the one function
 * every cooldown call site should use to claim a slot.
 */
export async function claimCooldown(key: string, ms: number): Promise<boolean> {
  const set = await container.redis.set(key, "1", "PX", ms, "NX");
  return set === "OK";
}

/** Read-only cooldown check - does not claim a slot. */
export async function isOnCooldown(key: string): Promise<boolean> {
  return (await container.redis.exists(key)) === 1;
}

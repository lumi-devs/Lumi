import type { Container } from "#src/lib/Services.js";

export async function claimCooldown(
  services: Container,
  key: string,
  ms: number,
): Promise<boolean> {
  const set = await services.valkey.set(key, "1", "PX", ms, "NX");
  return set === "OK";
}

export async function isOnCooldown(
  services: Container,
  key: string,
): Promise<boolean> {
  return (await services.valkey.exists(key)) === 1;
}

import type { Container } from "#src/lib/Services.js";
import { claimCooldown } from "#src/lib/cache/Cooldown.js";
import { cacheStore } from "#src/lib/cache/CacheStore.js";

export const StickyCooldownMs = 1_000;

export const stickyKey = (guildId: string, channelId: string): string =>
  `sticky:${guildId}:${channelId}`;

const stickyCooldownKey = (guildId: string, channelId: string): string =>
  `sticky:cd:${guildId}:${channelId}`;

export async function getStickyMessageId(
  _services: Container,
  guildId: string,
  channelId: string,
): Promise<string | null> {
  return cacheStore.get<string>(stickyKey(guildId, channelId)) ?? null;
}

export async function setStickyMessageId(
  _services: Container,
  guildId: string,
  channelId: string,
  messageId: string,
): Promise<void> {
  cacheStore.set(stickyKey(guildId, channelId), messageId, 86400 * 1000);
}

export async function delStickyMessageId(
  _services: Container,
  guildId: string,
  channelId: string,
): Promise<void> {
  cacheStore.delete(stickyKey(guildId, channelId));
}

export async function isStickyOnCooldown(
  _services: Container,
  guildId: string,
  channelId: string,
): Promise<boolean> {
  return !claimCooldown(stickyCooldownKey(guildId, channelId), StickyCooldownMs);
}

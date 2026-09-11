import { container } from "@sapphire/framework";

export const StickyCooldownMs = 1_000;

export const stickyKey = (guildId: string, channelId: string): string =>
  `lumi:sticky:${guildId}:${channelId}`;

export async function getStickyMessageId(
  guildId: string,
  channelId: string,
): Promise<string | null> {
  return container.redis.get(stickyKey(guildId, channelId));
}

export async function setStickyMessageId(
  guildId: string,
  channelId: string,
  messageId: string,
): Promise<void> {
  await container.redis.set(stickyKey(guildId, channelId), messageId);
}

export async function delStickyMessageId(
  guildId: string,
  channelId: string,
): Promise<void> {
  await container.redis.del(stickyKey(guildId, channelId));
}

const lastRepost = new Map<string, number>();

export function isStickyOnCooldown(
  guildId: string,
  channelId: string,
  now = Date.now(),
): boolean {
  const key = `${guildId}:${channelId}`;
  const last = lastRepost.get(key);
  if (last !== undefined && now - last < StickyCooldownMs) return true;
  lastRepost.set(key, now);
  return false;
}

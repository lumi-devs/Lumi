import { container } from "@sapphire/framework";
import { claimCooldown } from "#lib/cooldown.js";

export const StickyCooldownMs = 1_000;

export const stickyKey = (guildId: string, channelId: string): string =>
  `lumi:sticky:${guildId}:${channelId}`;

const stickyCooldownKey = (guildId: string, channelId: string): string =>
  `lumi:sticky:cd:${guildId}:${channelId}`;

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
  if (container.invalidation) {
    await container.invalidation.invalidate(stickyKey(guildId, channelId));
  } else {
    await container.redis.del(stickyKey(guildId, channelId));
  }
}

export async function isStickyOnCooldown(
  guildId: string,
  channelId: string,
): Promise<boolean> {
  return !(await claimCooldown(
    stickyCooldownKey(guildId, channelId),
    StickyCooldownMs,
  ));
}

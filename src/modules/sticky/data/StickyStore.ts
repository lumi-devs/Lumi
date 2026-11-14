import type { Container } from "@lib/Services.js";
import { claimCooldown } from "@redis/Cooldown.js";

export const StickyCooldownMs = 1_000;

export const stickyKey = (guildId: string, channelId: string): string =>
  `lumi:sticky:${guildId}:${channelId}`;

const stickyCooldownKey = (guildId: string, channelId: string): string =>
  `lumi:sticky:cd:${guildId}:${channelId}`;

export async function getStickyMessageId(
  services: Container,
  guildId: string,
  channelId: string,
): Promise<string | null> {
  return services.redis.get(stickyKey(guildId, channelId));
}

export async function setStickyMessageId(
  services: Container,
  guildId: string,
  channelId: string,
  messageId: string,
): Promise<void> {
  await services.redis.set(stickyKey(guildId, channelId), messageId);
}

export async function delStickyMessageId(
  services: Container,
  guildId: string,
  channelId: string,
): Promise<void> {
  await services.invalidation.invalidate(stickyKey(guildId, channelId));
}

export async function isStickyOnCooldown(
  services: Container,
  guildId: string,
  channelId: string,
): Promise<boolean> {
  return !(await claimCooldown(
    services,
    stickyCooldownKey(guildId, channelId),
    StickyCooldownMs,
  ));
}

// Worker-side fire handler for the periodic `captcha-expiry` sweeper. Each
// worker (broadcast mode) iterates its own guilds.cache so guild-shard
// affinity is preserved in scale topology.

import { container } from "@sapphire/framework";
import { VerifyKeys } from "../keys.js";

export async function handleCaptchaExpiryFire(): Promise<void> {
  const guilds = container.client.guilds.cache;

  for (const [guildId] of guilds) {
    const enabled = await container.db.modules
      .isModuleEnabled(guildId, "verify")
      .catch(() => false);
    if (!enabled) continue;

    const kickOnTimeout =
      (await container.db.config.getModuleConfig(
        guildId,
        "verify",
        "kick_on_timeout",
      )) ?? true;

    const now = Date.now();
    const expired = await container.redis.zrangebyscore(
      VerifyKeys.pendingSet(guildId),
      0,
      now,
    );

    for (const userId of expired) {
      try {
        if (kickOnTimeout) {
          const guild = guilds.get(guildId);
          const member = await guild?.members.fetch(userId).catch(() => null);
          if (member) {
            await member
              .kick("[CaptchaExpiry] Verification timed out")
              .catch(() => null);
          }
        }
        // Pipeline the two cleanup writes — one round-trip instead of two.
        await container.redis
          .multi()
          .zrem(VerifyKeys.pendingSet(guildId), userId)
          .del(VerifyKeys.seqState(guildId, userId))
          .exec();
      } catch (err: unknown) {
        container.logger.error(
          `[CaptchaExpiryTask] Failed for ${guildId}/${userId}:`,
          err,
        );
      }
    }
  }
}

import { type Container } from "@lib/Services.js";
import { RedisKeys } from "@redis/Store.js";
import { unlockAllTextChannels } from "@discord/ChannelLocks.js";
import { swallow } from "@utilities/Errors.js";
import { tryGetUtility } from "@module-system/Utility.js";
import type { AutoLockdownUnlockPayload } from "@modules/filter/tasks/AutoLockdownUnlock.js";

export async function handleAutoLockdownUnlockFire(
  services: Container,
  payload: AutoLockdownUnlockPayload,
): Promise<void> {
  const { guildId } = payload;
  const active = await services.redis.exists(RedisKeys.filterAutoLockdown(guildId));
  if (!active) return;

  const guild = await services.client.guilds
    .fetch(guildId)
    .catch(swallow("Filter: fetch guild for auto-lockdown unlock"));
  if (!guild) return;

  await unlockAllTextChannels(guild);
  await services.invalidation.invalidate(RedisKeys.filterAutoLockdown(guildId));

  const logService = tryGetUtility("guild-log");
  await logService?.dispatch(services, {
    guildId,
    moduleName: "filter",
    action: "Auto-Lockdown - Lifted",
    targetId: guildId,
    actorId: services.client.user!.id,
    reason: "Mention-flood lockdown window expired.",
  });
}

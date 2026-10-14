import { type Container } from "#src/lib/Services.js";
import { CacheKeys } from "#src/lib/cache/Keys.js";
import { unlockAllTextChannels } from "#src/lib/discord/ChannelLocks.js";
import { swallow } from "#src/lib/utilities/Errors.js";
import { tryGetUtility } from "#src/lib/module-system/Utility.js";
import type { AutoLockdownUnlockPayload } from "#src/modules/filter/tasks/AutoLockdownUnlock.js";

export async function handleAutoLockdownUnlockFire(
  services: Container,
  payload: AutoLockdownUnlockPayload,
): Promise<void> {
  const { guildId } = payload;
  const { cacheStore } = await import("#src/lib/cache/CacheStore.js");
  const active = cacheStore.has(CacheKeys.filterAutoLockdown(guildId));
  if (!active) return;

  const guild = await services.client.guilds
    .fetch(guildId)
    .catch(swallow("Filter: fetch guild for auto-lockdown unlock"));
  if (!guild) return;

  await unlockAllTextChannels(guild);
  await services.invalidation.invalidate(CacheKeys.filterAutoLockdown(guildId));

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

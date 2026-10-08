import { type Container } from "#lib/services.js";
import { ValkeyKeys } from "#lib/valkey/client.js";
import { unlockAllTextChannels } from "#lib/moderation/lockdown.js";
import { swallow } from "#lib/utilities/errors.js";
import { tryGetUtility } from "#lib/module-system/Utility.js";
import type { AutoLockdownUnlockPayload } from "#modules/filter/scheduled-tasks/autoLockdownUnlock.js";

export async function handleAutoLockdownUnlockFire(
  services: Container,
  payload: AutoLockdownUnlockPayload,
): Promise<void> {
  const { guildId } = payload;
  const active = await services.valkey.exists(ValkeyKeys.filterAutoLockdown(guildId));
  if (!active) return;

  const guild = await services.client.guilds
    .fetch(guildId)
    .catch(swallow("Filter: fetch guild for auto-lockdown unlock"));
  if (!guild) return;

  await unlockAllTextChannels(guild);
  await services.invalidation.invalidate(ValkeyKeys.filterAutoLockdown(guildId));

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

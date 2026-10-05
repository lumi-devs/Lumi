import { container } from "@sapphire/framework";
import { ValkeyKeys } from "#lib/database/valkey.js";
import { unlockAllTextChannels } from "#lib/moderation/lockdown.js";
import { swallow } from "#lib/utilities/errors.js";
import { tryGetUtility } from "#lib/module-system/Utility.js";
import type { AutoLockdownUnlockPayload } from "#modules/filter/scheduled-tasks/autoLockdownUnlock.js";

export async function handleAutoLockdownUnlockFire(
  payload: AutoLockdownUnlockPayload,
): Promise<void> {
  const { guildId } = payload;
  const active = await container.valkey.exists(ValkeyKeys.filterAutoLockdown(guildId));
  if (!active) return;

  const guild = await container.client.guilds
    .fetch(guildId)
    .catch(swallow("Filter: fetch guild for auto-lockdown unlock"));
  if (!guild) return;

  await unlockAllTextChannels(guild);
  await container.invalidation.invalidate(ValkeyKeys.filterAutoLockdown(guildId));

  const logService = tryGetUtility("guild-log");
  await logService?.dispatch({
    guildId,
    moduleName: "filter",
    action: "Auto-Lockdown - Lifted",
    targetId: guildId,
    actorId: container.client.user!.id,
    reason: "Mention-flood lockdown window expired.",
  });
}

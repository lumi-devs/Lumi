import { container } from "@lib/Services.js";
import { filterRpc } from "@contracts/rpc/Index.ts";
import { implementRpc } from "@rpc/Implement.js";
import { RedisKeys } from "@redis/Store.js";
import { getUtility } from "@module-system/Utility.js";
import type { FilterUtility } from "@modules/filter/utilities/FilterUtility.js";

function filterService(): FilterUtility {
  return getUtility("filter");
}

export const filterRpcHandlers = implementRpc(filterRpc, {
  "guild.filter.status": async ({ guildId }) => {
    const [lockdown, panic] = await Promise.all([
      container.redis.exists(RedisKeys.filterAutoLockdown(guildId)),
      container.redis.exists(RedisKeys.filterHeatPanicActive(guildId)),
    ]);
    return { lockdownActive: lockdown === 1, heatPanicActive: panic === 1 };
  },

  "guild.filter.lockdown.release": async ({ guildId }) => {
    await filterService().releaseAutoLockdown(container, guildId);
    return { success: true };
  },
});

import { container } from "#src/lib/Services.js";
import { filterRpc } from "#src/contracts/rpc/Index.ts";
import { implementRpc } from "#src/lib/rpc/Implement.js";
import { CacheKeys } from "#src/lib/cache/Keys.js";
import { getUtility } from "#src/lib/module-system/Utility.js";
import type { FilterUtility } from "#src/modules/filter/utilities/FilterUtility.js";

function filterService(): FilterUtility {
  return getUtility("filter");
}

export const filterRpcHandlers = implementRpc(filterRpc, {
  "guild.filter.status": async ({ guildId }) => {
    const { cacheStore } = await import("#src/lib/cache/CacheStore.js");
    const [lockdown, panic] = [
      cacheStore.has(CacheKeys.filterAutoLockdown(guildId)),
      cacheStore.has(CacheKeys.filterHeatPanicActive(guildId)),
    ];
    return { lockdownActive: lockdown, heatPanicActive: panic };
  },

  "guild.filter.lockdown.release": async ({ guildId }) => {
    await filterService().releaseAutoLockdown(container, guildId);
    return { success: true };
  },
});

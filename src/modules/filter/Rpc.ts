import { container } from "#src/lib/Services.js";
import { filterRpc } from "#src/contracts/rpc/Index.ts";
import { implementRpc } from "#src/lib/rpc/Implement.js";
import { ValkeyKeys } from "#src/lib/valkey/Client.js";
import { getUtility } from "#src/lib/module-system/Utility.js";
import type { FilterUtility } from "#src/modules/filter/utilities/FilterUtility.js";

function filterService(): FilterUtility {
  return getUtility("filter");
}

export const filterRpcHandlers = implementRpc(filterRpc, {
  "guild.filter.status": async ({ guildId }) => {
    const [lockdown, panic] = await Promise.all([
      container.valkey.exists(ValkeyKeys.filterAutoLockdown(guildId)),
      container.valkey.exists(ValkeyKeys.filterHeatPanicActive(guildId)),
    ]);
    return { lockdownActive: lockdown === 1, heatPanicActive: panic === 1 };
  },

  "guild.filter.lockdown.release": async ({ guildId }) => {
    await filterService().releaseAutoLockdown(container, guildId);
    return { success: true };
  },
});

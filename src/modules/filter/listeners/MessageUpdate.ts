import { getUtility } from "#src/lib/module-system/Utility.js";
import type { Container } from "#src/lib/Services.js";
import { LumiEvents } from "#src/lib/types/Common.js";
import type { GuildMessage } from "#src/lib/types/Common.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import type { FilterUtility } from "#src/modules/filter/utilities/FilterUtility.js";
import { enforceHit, runRules, shouldScreen } from "#src/modules/filter/services/Enforce.js";

export const FilterMessageEditListener = defineListener({
  name: "filterMessageUpdate",
  event: LumiEvents.GuildUserMessageEdit,
  module: "filter",
  async execute(services: Container, message: GuildMessage): Promise<void> {
    const filterService: FilterUtility = getUtility("filter");
    if (!(await shouldScreen(services, message, filterService))) return;

    const mentionCount =
      message.mentions.users.size + message.mentions.roles.size;

    const hit = await runRules(services, message, filterService, mentionCount);
    if (hit) await enforceHit(services, message, hit);
  },
});

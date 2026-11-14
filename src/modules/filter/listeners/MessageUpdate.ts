import { getUtility } from "@module-system/Utility.js";
import type { Container } from "@lib/Services.js";
import { LumiEvents } from "@lib/types/Common.js";
import type { GuildMessage } from "@lib/types/Common.js";
import { defineListener } from "@listeners/ListenerDef.js";
import type { FilterUtility } from "@modules/filter/utilities/FilterUtility.js";
import { enforceHit, runRules, shouldScreen } from "@modules/filter/services/Enforce.js";

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

import { getUtility } from "@lumi/lib/module-system/utility.js";
import type { Container } from "@lumi/lib/services.js";
import { LumiEvents } from "@lumi/lib/types/common.js";
import type { GuildMessage } from "@lumi/lib/types/common.js";
import { defineListener } from "@lumi/lib/listeners/listener-def.js";
import type { FilterUtility } from "../utilities/FilterUtility.js";
import { enforceHit, runRules, shouldScreen } from "@lumi/application/services/filter/enforce.js";

/**
 * Re-screens edited messages, which would otherwise let a member post something
 * clean and edit the banned content in afterwards.
 *
 * Deliberately runs only the hard rules - no heat accrual and no mention-flood
 * counting - so that repeatedly editing one message cannot inflate rate-based
 * counters the way posting that many messages would.
 */
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

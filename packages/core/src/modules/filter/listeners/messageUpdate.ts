import { ApplyOptions } from "@sapphire/decorators";
import { getUtility } from "#lib/module-system/Utility.js";
import { GuildMessageEditListener } from "#lib/module-system/GuildMessageEditListener.js";
import type { GuildMessage } from "#lib/types/common.js";
import type { FilterUtility } from "../utilities/FilterUtility.js";
import { enforceHit, runRules, shouldScreen } from "../lib/enforce.js";

/**
 * Re-screens edited messages, which would otherwise let a member post something
 * clean and edit the banned content in afterwards.
 *
 * Deliberately runs only the hard rules - no heat accrual and no mention-flood
 * counting - so that repeatedly editing one message cannot inflate rate-based
 * counters the way posting that many messages would.
 */
@ApplyOptions<GuildMessageEditListener.Options>({ module: "filter" })
export class FilterMessageEditListener extends GuildMessageEditListener {
  private get filterService(): FilterUtility {
    return getUtility("filter");
  }

  protected async handle(message: GuildMessage): Promise<void> {
    if (!(await shouldScreen(message, this.filterService))) return;

    const mentionCount =
      message.mentions.users.size + message.mentions.roles.size;

    const hit = await runRules(message, this.filterService, mentionCount);
    if (hit) await enforceHit(message, hit);
  }
}

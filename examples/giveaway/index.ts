import { cfg, DefineModule, Module } from "lumi";
import { registerTaskFireHandler } from "lumi/scheduling";
import { announceGiveawayEnd } from "./lib/announce.js";

@DefineModule({
  name: "giveaway",
  displayName: "Giveaways",
  emoji: "🎉",
  version: "1.0.0",
  description: "Run giveaways with an entry button, scheduled ending, and host-only rerolls.",
  configSchema: cfg.object({
    default_winner_count: cfg.number({
      label: "Default Winner Count",
      description: "Used when /giveaway start omits the winners option.",
      default: 1,
      min: 1,
      max: 20,
    }),
  }),
})
export class GiveawayModule extends Module {
  public override onLoad() {
    // "unicast": exactly one worker instance ends any given giveaway, even
    // if the fire event is delivered to a cluster of several workers -
    // ending a giveaway is a once-only side effect (announces winners),
    // not something every replica should redo independently.
    registerTaskFireHandler("giveaway-end", "unicast", async (payload) => {
      await announceGiveawayEnd(payload.guildId, payload.giveawayId);
    });
    return super.onLoad();
  }

  public override async deleteUserData(): Promise<void> {
    // Giveaway records reference hosts/winners by Discord ID, but that ID is
    // already publicly visible in the giveaway message itself while the
    // giveaway is live - there's no additional private data to scrub here.
  }
}

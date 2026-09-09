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
export class GiveawayModule extends Module {}

// The host owns the queue and fires exactly one worker's handler per job, so
// a giveaway is ended once even across a cluster of replicas.
registerTaskFireHandler("giveaway-end", async (payload) => {
  await announceGiveawayEnd(payload.guildId as string, payload.giveawayId as string);
});

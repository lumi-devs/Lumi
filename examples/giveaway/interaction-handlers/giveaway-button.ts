import {
  BaseInteractionHandler,
  InteractionContext,
} from "lumi/interactions";
import { editPrizeModal } from "../lib/modals.js";
import { enterGiveaway, getGiveaway } from "../lib/store.js";

// Handles both buttons posted by /giveaway start: "🎉 Enter" and "Edit Prize"
// (giveaway:enter:<id> / giveaway:editprize:<id>).
export default class GiveawayButtonHandler extends BaseInteractionHandler {
  public readonly prefix = "giveaway:";

  public async run(ctx: InteractionContext): Promise<void> {
    const [, action, giveawayId] = ctx.customId.split(":");
    if ((action !== "enter" && action !== "editprize") || !giveawayId) return;
    if (!ctx.guildId) return;

    const record = await getGiveaway(ctx.guildId, giveawayId);
    if (!record) return ctx.replyError("Gone", "This giveaway no longer exists.");
    if (record.endedAt) return ctx.replyError("Ended", "This giveaway has already ended.");

    if (action === "editprize") {
      if (ctx.user.id !== record.hostId) {
        return ctx.replyError("Not the Host", "Only the giveaway host can edit the prize.");
      }
      // showModal must be the first response - never defer beforehand.
      return ctx.showModal(editPrizeModal(giveawayId, record.prize));
    }

    await ctx.defer();
    const count = await enterGiveaway(ctx.guildId, giveawayId, ctx.user.id);
    return ctx.replySuccess(
      "You're Entered!",
      `Good luck! ${count} ${count === 1 ? "person has" : "people have"} entered so far.`,
    );
  }
}

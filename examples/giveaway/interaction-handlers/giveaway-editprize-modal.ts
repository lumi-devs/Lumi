import {
  BaseInteractionHandler,
  InteractionContext,
  deferUpdate,
  editReply,
} from "lumi/interactions";
import { EDIT_PRIZE_MODAL_PREFIX } from "../lib/modals.js";
import { getGiveaway, updateGiveaway } from "../lib/store.js";

export default class GiveawayEditPrizeModalHandler extends BaseInteractionHandler {
  public readonly prefix = `${EDIT_PRIZE_MODAL_PREFIX}:`;

  public async run(ctx: InteractionContext): Promise<void> {
    const giveawayId = ctx.customId.split(":")[2];
    if (!giveawayId || !ctx.guildId) return;

    const record = await getGiveaway(ctx.guildId, giveawayId);
    if (!record) return ctx.replyError("Gone", "This giveaway no longer exists.");
    if (ctx.user.id !== record.hostId) {
      return ctx.replyError("Not the Host", "Only the giveaway host can edit the prize.");
    }
    if (record.endedAt) return ctx.replyError("Ended", "This giveaway has already ended.");

    const prize = (ctx.fields.prize ?? "").trim();
    if (!prize) return ctx.replyError("Invalid Prize", "The prize can't be empty.");

    await deferUpdate();
    const updated = await updateGiveaway(ctx.guildId, giveawayId, { prize });
    if (!updated) return;

    const endsAtUnix = Math.floor(updated.endsAt / 1000);
    await editReply({
      content: `🎉 **${updated.prize}**\nEnds <t:${endsAtUnix}:R> - ${updated.winnerCount} winner${updated.winnerCount === 1 ? "" : "s"}.`,
    });
  }
}

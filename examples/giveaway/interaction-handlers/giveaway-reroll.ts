import { userMention } from "@discordjs/formatters";
import {
  BaseInteractionHandler,
  InteractionContext,
  deferUpdate,
  editReply,
} from "lumi/interactions";
import { getGiveaway, pickWinners, updateGiveaway } from "../lib/store.js";

export default class GiveawayRerollHandler extends BaseInteractionHandler {
  public readonly prefix = "giveaway:reroll:";

  public async run(ctx: InteractionContext): Promise<void> {
    const giveawayId = ctx.customId.split(":")[2];
    if (!giveawayId || !ctx.guildId) return;

    const record = await getGiveaway(ctx.guildId, giveawayId);
    if (!record?.endedAt) return ctx.replyError("Not Ended", "This giveaway hasn't ended yet.");
    if (ctx.user.id !== record.hostId) {
      return ctx.replyError("Not the Host", "Only the giveaway host can reroll winners.");
    }

    await deferUpdate();
    const count = Number.parseInt(ctx.values[0] ?? "1", 10);
    const winners = await pickWinners(ctx.guildId, giveawayId, count);
    const updated = await updateGiveaway(ctx.guildId, giveawayId, { winners });
    if (!updated) return;

    await editReply({
      content: `🎉 **Giveaway ended: ${updated.prize}**\nWinners: ${
        winners.length ? winners.map((id) => userMention(id)).join(", ") : "No valid entries."
      }`,
    });
  }
}

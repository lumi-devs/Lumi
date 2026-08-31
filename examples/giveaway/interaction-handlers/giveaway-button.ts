import { ApplyOptions } from "@sapphire/decorators";
import { InteractionHandler, InteractionHandlerTypes, UserError } from "@sapphire/framework";
import { MessageFlags, type ButtonInteraction } from "discord.js";
import { getUtility } from "lumi";
import { makeSuccessCard } from "lumi/ui";
import { showEditPrizeModal } from "../lib/modals.js";
import { getGiveaway } from "../lib/store.js";

// Handles both buttons posted by /giveaway start: "🎉 Enter" and "Edit Prize"
// (giveaway:enter:<id> / giveaway:editprize:<id>). One handler, branching on
// the action, mirrors how first-party modules group related buttons - see
// tempvc's tempvc-panel-button.ts.
@ApplyOptions<InteractionHandler.Options>({
  name: "giveaway-button",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export default class GiveawayButtonHandler extends InteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("giveaway:")) return this.none();
    const [, action, giveawayId] = interaction.customId.split(":");
    if (action !== "enter" && action !== "editprize") return this.none();
    if (!giveawayId) return this.none();
    return this.some({ action, giveawayId });
  }

  public async run(
    interaction: ButtonInteraction,
    { action, giveawayId }: { action: "enter" | "editprize"; giveawayId: string },
  ): Promise<void> {
    if (!interaction.guildId) return;

    const record = await getGiveaway(interaction.guildId, giveawayId);
    if (!record) {
      throw new UserError({ identifier: "GiveawayGone", message: "This giveaway no longer exists." });
    }
    if (record.endedAt) {
      throw new UserError({ identifier: "GiveawayEnded", message: "This giveaway has already ended." });
    }

    if (action === "editprize") {
      if (interaction.user.id !== record.hostId) {
        throw new UserError({ identifier: "GiveawayNotHost", message: "Only the giveaway host can edit the prize." });
      }
      // showModal() must be the first response - can't defer before calling it.
      await showEditPrizeModal(interaction, giveawayId, record.prize);
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
    const service = getUtility("giveaway");
    const count = await service.enter(interaction.guildId, giveawayId, interaction.user.id);
    await interaction.editReply(
      makeSuccessCard("You're Entered!", `Good luck! ${count} ${count === 1 ? "person has" : "people have"} entered so far.`),
    );
  }
}

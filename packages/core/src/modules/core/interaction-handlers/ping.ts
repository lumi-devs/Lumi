import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandlerTypes,
  InteractionHandler,
} from "@sapphire/framework";
import { collectPingData } from "../services/ping-collect.js";
import {
  buildOverviewCard,
  buildDetailCard,
  type PingCategory,
} from "../ui/ping-cards.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { PingId } from "../constants.js";

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.MessageComponent,
})
export class PingInteractionHandler extends BaseInteractionHandler {
  public override parse(interaction: import("discord.js").Interaction) {
    if (!interaction.isMessageComponent()) return this.none();
    const parsed = PingId.parse(interaction.customId);
    if (!parsed) return this.none();
    const { cat, userId } = parsed;

    let category = cat;
    if (category === "select" && interaction.isStringSelectMenu()) {
      category = interaction.values[0]!;
    }

    return this.some({
      category: category as PingCategory | "overview",
      userId,
      interaction,
    });
  }

  public override async run(
    interaction: import("discord.js").Interaction,
    result: { category: PingCategory | "overview"; userId: string },
  ) {
    if (!interaction.isMessageComponent()) return;
    this.checkSecurity(interaction, result.userId);

    await this.acknowledge(interaction);

    const { pingViewStates } = await import("../commands/ping.js");
    pingViewStates.set(result.userId, result.category);

    const data = await collectPingData();

    if (result.category === "overview") {
      return interaction
        .editReply({
          components: [
            buildOverviewCard({ roundTrip: null, ...data }, result.userId),
          ],
        })
        .catch(() => null);
    }

    const card = buildDetailCard(
      result.category,
      { roundTrip: null, ...data },
      result.userId,
    );
    return interaction.editReply({ components: [card] }).catch(() => null);
  }
}

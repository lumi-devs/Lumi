import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandlerTypes,
  InteractionHandler,
} from "@sapphire/framework";
import { type ButtonInteraction } from "discord.js";
import { collectPingData } from "../lib/ping-collect.js";
import {
  buildOverviewCard,
  buildDetailCard,
  type PingCategory,
} from "../lib/ping-cards.js";
import { EmberInteractionHandler } from "../lib/interaction-handler.js";

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class PingInteractionHandler extends EmberInteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("ping:")) return this.none();

    const [prefix, category, userId] = interaction.customId.split(":");
    if (prefix !== "ping" || !category || !userId) return this.none();

    return this.some({
      category: category as PingCategory | "overview",
      userId,
    });
  }

  public override async run(
    interaction: ButtonInteraction,
    result: { category: PingCategory | "overview"; userId: string },
  ) {
    if (!(await this.checkSecurity(interaction, result.userId))) return;

    try {
      await this.acknowledge(interaction);
      const data = await collectPingData();

      if (result.category === "overview") {
        return interaction.editReply({
          components: [
            buildOverviewCard({ roundTrip: null, ...data }, result.userId),
          ],
        });
      }

      const card = buildDetailCard(
        result.category as PingCategory,
        { roundTrip: null, ...data },
        result.userId,
      );
      return interaction.editReply({ components: [card] });
    } catch (error) {
      return this.handleError(interaction, error);
    }
  }
}

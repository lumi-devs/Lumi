import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandlerTypes,
  InteractionHandler,
} from "@sapphire/framework";
import { collectPingData } from "#modules/core/lib/ping-collect.js";
import {
  buildOverviewCard,
  buildDetailCard,
  type PingCategory,
} from "#modules/core/lib/ping-cards.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.MessageComponent,
})
export class PingInteractionHandler extends BaseInteractionHandler {
  public override parse(interaction: import("discord.js").Interaction) {
    if (!interaction.isMessageComponent()) return this.none();
    if (!interaction.customId.startsWith("ping:")) return this.none();

    const [prefix, cat, userId] = interaction.customId.split(":");
    if (prefix !== "ping" || !cat || !userId) return this.none();

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
